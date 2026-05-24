import { Request, Response } from 'express';
import * as tradingDb from '../../../infra/trading-db.service';
import * as cryptoDb from '../../../infra/crypto-db.service';
import * as dexDb from '../../../infra/dex-db.service';
import { combineCexWithDexAverages, combineCexWithDexOrders } from '../../../shared/dex.service';
import { getRequiredQueryParam, getQueryInt } from '../../../shared/http';
import { Balance, CancelOrderRequest, NewOrder, Order, Product, Ticker, toNewDexOrder } from '../../../shared/models';
import * as cryptoClient from './crypto.client';
import { analyzeRecentBuyAverage, apiToCryptoDoc, toCommonOrder, toCommonProduct, toCommonTicker } from './crypto.mapper';
import { importHistoryJobs } from './import-history.jobs';

const DEX_CEX = 'crypto';
const HISTORY_HOURS = 23;

export async function getTickers(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const symbols = new Set(user.crypto.map((p) => p.symbol));
  const tickers = await cryptoClient.getTickers();
  const body: Record<string, Ticker> = {};
  for (const t of tickers) {
    if (symbols.has(t.i)) {
      body[t.i] = toCommonTicker(t);
    }
  }
  res.json(body);
}

export async function getBalances(_req: Request, res: Response): Promise<void> {
  const response = await cryptoClient.getUserBalance();
  const positionBalances = response.data[0]?.position_balances ?? [];
  const body: Record<string, Balance> = {};
  for (const raw of positionBalances) {
    const reserved = parseFloat(raw.reserved_qty ?? '0');
    const quantity = parseFloat(raw.quantity ?? '0');
    body[raw.instrument_name] = { available: quantity - reserved, locked: reserved };
  }
  res.json(body);
}

export async function getAverages(_req: Request, res: Response, userId: string): Promise<void> {
  const cex = await cryptoDb.getCryptoAveragesAsync(userId);
  const dex = await dexDb.getDexAveragesAsync(userId, DEX_CEX);
  res.json(combineCexWithDexAverages(cex, dex));
}

export async function getOpenOrders(_req: Request, res: Response): Promise<void> {
  const response = await cryptoClient.getOpenOrders();
  const body: Record<string, Order[]> = {};
  for (const order of response.data ?? []) {
    const doc = apiToCryptoDoc(order);
    if (!body[doc.instrument_name]) body[doc.instrument_name] = [];
    body[doc.instrument_name].push(toCommonOrder(doc));
  }
  res.json(body);
}

export async function getProducts(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const symbols = new Set(user.crypto.map((p) => p.symbol));
  const instruments = await cryptoClient.getInstruments();
  const body: Record<string, Product> = {};
  for (const inst of instruments) {
    if (symbols.has(inst.symbol)) {
      body[inst.symbol] = toCommonProduct(inst);
    }
  }
  res.json(body);
}

export async function getCurrencyPairs(_req: Request, res: Response): Promise<void> {
  const tickers = await cryptoClient.getTickers();
  res.json(tickers.map((t) => t.i));
}

export async function getHistory(req: Request, res: Response, userId: string): Promise<void> {
  const pair = getRequiredQueryParam(req, 'pair');
  await syncRecentHistory(userId);
  const orders = await cryptoDb.getCryptoOrdersAsync(pair, userId);
  const cex = orders.map(toCommonOrder);
  const dex = await dexDb.getDexOrdersAsync(pair, userId, DEX_CEX);
  res.json(combineCexWithDexOrders(cex, dex));
}

export async function getRecentTradeHistory(req: Request, res: Response, userId: string): Promise<void> {
  const side = getRequiredQueryParam(req, 'side');
  const limit = getQueryInt(req, 'limit', 10);
  await syncRecentHistory(userId);
  const orders = await cryptoDb.getCryptoOrdersBySideAsync(side, limit, userId);
  res.json(orders.map(toCommonOrder));
}

export async function getRecentBuyAverages(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const entries = await Promise.all(
    user.crypto.map(async (pair) => {
      const orders = await cryptoDb.getCryptoFilledOrdersAsync(pair.symbol, userId);
      return [pair.symbol, analyzeRecentBuyAverage(orders)] as const;
    })
  );
  res.json(Object.fromEntries(entries));
}

export async function createOrder(req: Request, res: Response): Promise<void> {
  const order = req.body as NewOrder;
  const side = order.side === 'buy' ? 'BUY' : 'SELL';
  const params: Record<string, unknown> = {
    instrument_name: order.currencyPair,
    side,
    type: order.market ? 'MARKET' : 'LIMIT',
  };
  if (order.market) {
    if (order.side === 'sell') {
      params.quantity = order.amount;
    } else if (parseFloat(order.total) > 0) {
      params.notional = order.total;
    } else {
      params.quantity = order.amount;
    }
  } else {
    params.price = order.price;
    params.quantity = order.amount;
  }
  res.json(await cryptoClient.createOrder(params));
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  const body = req.body as CancelOrderRequest;
  res.json(await cryptoClient.cancelOrder(body.id, body.pair));
}

export async function addDexOrder(req: Request, res: Response, userId: string): Promise<void> {
  res.json(await dexDb.upsertDexOrderAsync(toNewDexOrder(req.body as NewOrder, DEX_CEX), userId));
}

export async function updateRecentHistory(_req: Request, res: Response, userId: string): Promise<void> {
  await syncRecentHistory(userId);
  res.status(200).send();
}

export async function importHistory(_req: Request, res: Response, userId: string): Promise<void> {
  await syncRecentHistory(userId);
  res.status(200).send();
}

export async function importHistoryHttpStart(req: Request, res: Response, userId: string): Promise<void> {
  const periodMonths = (req.body as { periodMonths?: number })?.periodMonths ?? 12;
  const job = importHistoryJobs.start(userId, periodMonths, req);
  res.status(202).json({
    id: job.id,
    statusQueryGetUri: job.statusUrl,
  });
}

export async function importHistoryStatus(req: Request, res: Response): Promise<void> {
  const instanceId = getRequiredQueryParam(req, 'instanceId');
  const status = importHistoryJobs.getStatus(instanceId);
  if (!status) {
    res.status(404).json({ error: 'job not found' });
    return;
  }
  res.json(status);
}

export async function doSomeTechService(_req: Request, res: Response): Promise<void> {
  res.status(200).send();
}

export async function syncRecentHistory(userId: string): Promise<void> {
  const end = Date.now();
  const start = end - HISTORY_HOURS * 60 * 60 * 1000;
  const response = await cryptoClient.getOrderHistory(start, end);
  const docs = (response.data ?? [])
    .filter((o) => o.status === 'FILLED')
    .map((o) => {
      const doc = apiToCryptoDoc(o);
      doc.id = doc.order_id;
      return doc;
    });
  if (docs.length) {
    await cryptoDb.upsertCryptoOrdersAsync(docs, userId);
  }
}

export async function syncAllUserPairs(userId: string): Promise<void> {
  await syncRecentHistory(userId);
}
