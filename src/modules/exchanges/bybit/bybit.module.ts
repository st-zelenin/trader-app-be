import { Request, Response } from 'express';
import * as tradingDb from '../../../infra/trading-db.service';
import * as bybitDb from '../../../infra/bybit-db.service';
import * as dexDb from '../../../infra/dex-db.service';
import { combineCexWithDexAverages, combineCexWithDexOrders } from '../../../shared/dex.service';
import { getRequiredQueryParam, getQueryInt } from '../../../shared/http';
import { Balance, CancelOrderRequest, NewOrder, Order, Product, Ticker, toNewDexOrder } from '../../../shared/models';
import * as bybitClient from './bybit.client';
import { analyzeRecentBuyAverage, toCommonOrder, toCommonProduct, toCommonTicker, v5ToBybitDoc } from './bybit.mapper';

const DEX_CEX = 'bybit';

export async function getTickers(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const symbols = user.bybit.map((p) => p.symbol);
  if (!symbols.length) {
    res.json({});
    return;
  }
  const tickers = await bybitClient.getTickers(symbols);
  const body: Record<string, Ticker> = {};
  for (const t of tickers) {
    body[t.symbol] = toCommonTicker(t);
  }
  res.json(body);
}

export async function getBalances(_req: Request, res: Response): Promise<void> {
  const raw = await bybitClient.getWalletBalances();
  const body: Record<string, Balance> = {};
  for (const b of raw) {
    body[b.coin] = { available: parseFloat(b.free), locked: parseFloat(b.locked) };
  }
  res.json(body);
}

export async function getAverages(_req: Request, res: Response, userId: string): Promise<void> {
  const cex = await bybitDb.getBybitAveragesAsync(userId);
  const dex = await dexDb.getDexAveragesAsync(userId, DEX_CEX);
  res.json(combineCexWithDexAverages(cex, dex));
}

export async function getOpenOrders(_req: Request, res: Response): Promise<void> {
  const raw = await bybitClient.getOpenOrders();
  const body: Record<string, Order[]> = {};
  for (const order of raw) {
    const doc = v5ToBybitDoc(order);
    if (!body[doc.symbol]) body[doc.symbol] = [];
    body[doc.symbol].push(toCommonOrder(doc));
  }
  res.json(body);
}

export async function getProducts(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const symbols = new Set(user.bybit.map((p) => p.symbol));
  const info = await bybitClient.getInstrumentsInfo();
  const body: Record<string, Product> = {};
  for (const item of info) {
    const symbol = String(item.symbol);
    if (symbols.has(symbol)) {
      body[symbol] = toCommonProduct(item as Parameters<typeof toCommonProduct>[0]);
    }
  }
  res.json(body);
}

export async function getCurrencyPairs(_req: Request, res: Response): Promise<void> {
  const info = await bybitClient.getInstrumentsInfo();
  res.json(info.map((i) => String(i.symbol)));
}

export async function getHistory(req: Request, res: Response, userId: string): Promise<void> {
  const pair = getRequiredQueryParam(req, 'pair');
  await importRecentHistory(pair, userId);
  const orders = await bybitDb.getBybitOrdersAsync(pair, userId);
  const filled = orders.filter((o) => o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED');
  const cex = filled.map(toCommonOrder);
  const dex = await dexDb.getDexOrdersAsync(pair, userId, DEX_CEX);
  res.json(combineCexWithDexOrders(cex, dex));
}

export async function getRecentTradeHistory(req: Request, res: Response, userId: string): Promise<void> {
  const side = getRequiredQueryParam(req, 'side');
  const limit = getQueryInt(req, 'limit', 10);
  const user = await tradingDb.getUserAsync(userId);
  await Promise.all(user.bybit.map((p) => importRecentHistory(p.symbol, userId)));
  const orders = await bybitDb.getBybitOrdersBySideAsync(side, limit, userId);
  res.json(orders.map(toCommonOrder));
}

export async function getRecentBuyAverages(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const entries = await Promise.all(
    user.bybit.map(async (pair) => {
      const orders = await bybitDb.getBybitFilledOrdersAsync(pair.symbol, userId);
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
  const ticker = await bybitClient.getTicker(order.currencyPair);
  if (ticker) {
    const tickerPrice = parseFloat(ticker.lastPrice);
    if (
      (order.side === 'buy' && price > tickerPrice) ||
      (order.side === 'sell' && price < tickerPrice)
    ) {
      res.json(await createMarketOrder(order));
      return;
    }
  }
  res.json(await createLimitOrder(order, price));
}

async function createMarketOrder(order: NewOrder): Promise<Record<string, unknown>> {
  const side = order.side === 'buy' ? 'Buy' : 'Sell';
  const total = parseFloat(order.total);
  if (!Number.isNaN(total) && total > 0) {
    return bybitClient.submitOrder({
      category: 'spot',
      symbol: order.currencyPair,
      side,
      orderType: 'Market',
      qty: String(total),
      marketUnit: 'quoteCoin',
    });
  }
  const amount = parseFloat(order.amount);
  if (!Number.isNaN(amount) && amount > 0) {
    return bybitClient.submitOrder({
      category: 'spot',
      symbol: order.currencyPair,
      side,
      orderType: 'Market',
      qty: String(amount),
    });
  }
  throw new Error('either amount or total should be provided');
}

async function createLimitOrder(order: NewOrder, price: number): Promise<Record<string, unknown>> {
  return bybitClient.submitOrder({
    category: 'spot',
    symbol: order.currencyPair,
    side: order.side === 'buy' ? 'Buy' : 'Sell',
    orderType: 'Limit',
    qty: order.amount,
    price: String(price),
  });
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  const body = req.body as CancelOrderRequest;
  res.json(await bybitClient.cancelOrder(body.pair, body.id));
}

export async function addDexOrder(req: Request, res: Response, userId: string): Promise<void> {
  const order = req.body as NewOrder;
  res.json(await dexDb.upsertDexOrderAsync(toNewDexOrder(order, DEX_CEX), userId));
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
  await upsertHistory(await bybitClient.getOrderHistory(pair, 100), userId);
}

async function importFullHistory(pair: string, userId: string): Promise<void> {
  await upsertHistory(await bybitClient.getOrderHistory(pair), userId);
}

async function upsertHistory(raw: Record<string, unknown>[], userId: string): Promise<void> {
  const docs = raw
    .filter(
      (o) =>
        o.orderStatus === 'Filled' ||
        (o.orderType === 'Market' && o.orderStatus === 'PartiallyFilledCanceled')
    )
    .map((o) => {
      const doc = v5ToBybitDoc(o);
      doc.id = doc.orderId;
      return doc;
    });
  if (docs.length) {
    await bybitDb.upsertBybitOrdersAsync(docs, userId);
  }
}

export async function syncAllUserPairs(userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  for (const pair of user.bybit) {
    if (!pair.isArchived) {
      await importRecentHistory(pair.symbol, userId);
    }
  }
}
