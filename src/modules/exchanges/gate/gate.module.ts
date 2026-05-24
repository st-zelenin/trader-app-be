import { Order as GateOrder } from 'gate-api';
import { Request, Response } from 'express';
import * as tradingDb from '../../../infra/trading-db.service';
import * as gateDb from '../../../infra/gate-db.service';
import * as dexDb from '../../../infra/dex-db.service';
import { combineCexWithDexAverages, combineCexWithDexOrders } from '../../../shared/dex.service';
import { getRequiredQueryParam, getQueryInt } from '../../../shared/http';
import { Balance, CancelOrderRequest, NewOrder, Order, Product, Ticker, toNewDexOrder } from '../../../shared/models';
import * as gateClient from './gate.client';
import { analyzeRecentBuyAverage, apiToGateDoc, toCommonOrder, toCommonProduct, toCommonTicker } from './gate.mapper';

const DEX_CEX = 'gate';
const WINDOW_SEC = 29 * 24 * 60 * 60;

export async function getTickers(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const symbols = new Set(user.gate.map((p) => p.symbol));
  const tickers = await gateClient.listTickers();
  const body: Record<string, Ticker> = {};
  for (const t of tickers) {
    if (symbols.has(t.currency_pair)) {
      body[t.currency_pair] = toCommonTicker({
        currency_pair: t.currency_pair,
        last: t.last,
        change_percentage: t.change_percentage,
      });
    }
  }
  res.json(body);
}

export async function getBalances(_req: Request, res: Response): Promise<void> {
  const raw = await gateClient.listSpotAccounts();
  const body: Record<string, Balance> = {};
  for (const b of raw) {
    body[b.currency] = { available: parseFloat(b.available), locked: parseFloat(b.locked) };
  }
  res.json(body);
}

export async function getAverages(_req: Request, res: Response, userId: string): Promise<void> {
  const cex = await gateDb.getGateAveragesAsync(userId);
  const dex = await dexDb.getDexAveragesAsync(userId, DEX_CEX);
  res.json(combineCexWithDexAverages(cex, dex));
}

export async function getOpenOrders(_req: Request, res: Response): Promise<void> {
  const raw = await gateClient.listOpenOrders();
  const body: Record<string, Order[]> = {};
  for (const order of raw) {
    const doc = apiToGateDoc(order);
    if (!body[doc.currency_pair]) body[doc.currency_pair] = [];
    body[doc.currency_pair].push(toCommonOrder(doc));
  }
  res.json(body);
}

export async function getProducts(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const symbols = new Set(user.gate.map((p) => p.symbol));
  const pairs = await gateClient.listCurrencyPairs();
  const body: Record<string, Product> = {};
  for (const p of pairs) {
    if (symbols.has(p.id)) {
      body[p.id] = toCommonProduct(p as Parameters<typeof toCommonProduct>[0]);
    }
  }
  res.json(body);
}

export async function getCurrencyPairs(_req: Request, res: Response): Promise<void> {
  const pairs = await gateClient.listCurrencyPairs();
  res.json(pairs.map((p) => p.id));
}

export async function getHistory(req: Request, res: Response, userId: string): Promise<void> {
  const pair = getRequiredQueryParam(req, 'pair');
  await importRecentHistory(pair, userId);
  const orders = await gateDb.getGateOrdersAsync(pair, userId);
  const closed = orders.filter((o) => o.status === 'closed');
  const cex = closed.map(toCommonOrder);
  const dex = await dexDb.getDexOrdersAsync(pair, userId, DEX_CEX);
  res.json(combineCexWithDexOrders(cex, dex));
}

export async function getRecentTradeHistory(req: Request, res: Response, userId: string): Promise<void> {
  const side = getRequiredQueryParam(req, 'side');
  const limit = getQueryInt(req, 'limit', 10);
  const user = await tradingDb.getUserAsync(userId);
  await Promise.all(user.gate.map((p) => importRecentHistory(p.symbol, userId)));
  const orders = await gateDb.getGateOrdersBySideAsync(side, limit, userId);
  res.json(orders.map(toCommonOrder));
}

export async function getRecentBuyAverages(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const entries = await Promise.all(
    user.gate.map(async (pair) => {
      const orders = await gateDb.getGateFilledOrdersAsync(pair.symbol, userId);
      return [pair.symbol, analyzeRecentBuyAverage(orders)] as const;
    })
  );
  res.json(Object.fromEntries(entries));
}

export async function createOrder(req: Request, res: Response): Promise<void> {
  const order = req.body as NewOrder;
  if (order.market) {
    res.json(await createMarketOrder(order));
    return;
  }
  const price = parseFloat(order.price);
  const ticker = await gateClient.getTicker(order.currencyPair);
  if (ticker) {
    const tickerPrice = parseFloat(ticker.last);
    if (
      (order.side === 'buy' && price > tickerPrice) ||
      (order.side === 'sell' && price < tickerPrice)
    ) {
      res.json(await createMarketOrder(order));
      return;
    }
  }
  const gateOrder = new GateOrder();
  gateOrder.currencyPair = order.currencyPair;
  gateOrder.side = order.side === 'buy' ? GateOrder.Side.Buy : GateOrder.Side.Sell;
  gateOrder.type = GateOrder.Type.Limit;
  gateOrder.amount = order.amount;
  gateOrder.price = order.price;
  res.json(await gateClient.createOrder(gateOrder));
}

async function createMarketOrder(order: NewOrder): Promise<Record<string, unknown>> {
  const gateOrder = new GateOrder();
  gateOrder.currencyPair = order.currencyPair;
  gateOrder.side = order.side === 'buy' ? GateOrder.Side.Buy : GateOrder.Side.Sell;
  gateOrder.type = GateOrder.Type.Market;
  gateOrder.timeInForce = GateOrder.TimeInForce.Fok;
  gateOrder.amount = order.side === 'buy' ? order.total || order.amount : order.amount;
  return gateClient.createOrder(gateOrder);
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  const body = req.body as CancelOrderRequest;
  await gateClient.cancelOrder(body.id, body.pair);
  res.status(200).send();
}

export async function addDexOrder(req: Request, res: Response, userId: string): Promise<void> {
  res.json(await dexDb.upsertDexOrderAsync(toNewDexOrder(req.body as NewOrder, DEX_CEX), userId));
}

export async function updateRecentHistory(req: Request, res: Response, userId: string): Promise<void> {
  await importRecentHistory(getRequiredQueryParam(req, 'pair'), userId);
  res.status(200).send();
}

export async function importHistory(req: Request, res: Response, userId: string): Promise<void> {
  await importFullHistory(getRequiredQueryParam(req, 'pair'), userId);
  res.status(200).send();
}

export async function doSomeTechService(_req: Request, res: Response): Promise<void> {
  res.status(200).send();
}

async function importRecentHistory(pair: string, userId: string): Promise<void> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - WINDOW_SEC;
  await upsertOrders(await gateClient.listOrders(pair, from, to), userId);
}

async function importFullHistory(pair: string, userId: string): Promise<void> {
  const to = Math.floor(Date.now() / 1000);
  let end = to;
  const tasks: Promise<void>[] = [];
  for (let i = 0; i < 24; i++) {
    const start = end - WINDOW_SEC;
    tasks.push(upsertOrders(await gateClient.listOrders(pair, start, end), userId));
    end = start;
  }
  await Promise.all(tasks);
}

async function upsertOrders(raw: Record<string, unknown>[], userId: string): Promise<void> {
  const docs = raw.map((o) => apiToGateDoc(o));
  if (docs.length) {
    await gateDb.upsertGateOrdersAsync(docs, userId);
  }
}

export async function syncAllUserPairs(userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  await Promise.all(
    user.gate.filter((p) => !p.isArchived).map((p) => importRecentHistory(p.symbol, userId))
  );
}
