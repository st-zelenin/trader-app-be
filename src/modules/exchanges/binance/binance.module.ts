import { Request, Response } from 'express';
import * as tradingDb from '../../../infra/trading-db.service';
import * as binanceDb from '../../../infra/binance-db.service';
import * as dexDb from '../../../infra/dex-db.service';
import { combineCexWithDexAverages, combineCexWithDexOrders } from '../../../shared/dex.service';
import { getRequiredQueryParam, getQueryInt } from '../../../shared/http';
import {
  Balance,
  CancelOrderRequest,
  NewOrder,
  Order,
  Product,
  Ticker,
  toNewDexOrder,
} from '../../../shared/models';
import { SpotRestAPI } from '@binance/spot';
import * as binanceClient from './binance.client';
import {
  analyzeRecentBuyAverage,
  docFromApiOrder,
  toCommonOrder,
  toCommonProduct,
  toCommonTicker,
} from './binance.mapper';

const DEX_CEX = 'binance';

export async function getTickers(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const symbols = user.binance.map((p) => p.symbol);
  if (symbols.length === 0) {
    res.json({});
    return;
  }
  const tickers = await binanceClient.getTickers24hr(symbols);
  const body: Record<string, Ticker> = {};
  for (const t of tickers) {
    body[t.symbol] = toCommonTicker(t);
  }
  res.json(body);
}

export async function getBalances(_req: Request, res: Response): Promise<void> {
  const raw = await binanceClient.getUserBalances();
  const body: Record<string, Balance> = {};
  for (const b of raw) {
    body[b.asset] = { available: parseFloat(b.free), locked: parseFloat(b.locked) };
  }
  res.json(body);
}

export async function getAverages(_req: Request, res: Response, userId: string): Promise<void> {
  const cex = await binanceDb.getBinanceAveragesAsync(userId);
  const dex = await dexDb.getDexAveragesAsync(userId, DEX_CEX);
  res.json(combineCexWithDexAverages(cex, dex));
}

export async function getOpenOrders(_req: Request, res: Response): Promise<void> {
  const raw = await binanceClient.getOpenOrders();
  const body: Record<string, Order[]> = {};
  for (const order of raw) {
    const doc = docFromApiOrder(order);
    if (!body[doc.symbol]) {
      body[doc.symbol] = [];
    }
    body[doc.symbol].push(toCommonOrder(doc));
  }
  res.json(body);
}

export async function getProducts(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const symbols = user.binance.map((p) => p.symbol);
  const info = await binanceClient.getExchangeInfo(symbols);
  const body: Record<string, Product> = {};
  for (const s of info) {
    body[s.symbol] = toCommonProduct(s);
  }
  res.json(body);
}

export async function getCurrencyPairs(_req: Request, res: Response, _userId: string): Promise<void> {
  const pairs = await binanceClient.getAllSpotSymbols();
  res.json(pairs);
}

export async function getHistory(req: Request, res: Response, userId: string): Promise<void> {
  const pair = getRequiredQueryParam(req, 'pair');
  await importRecentHistory(pair, userId);
  const orders = await binanceDb.getBinanceOrdersAsync(pair, userId);
  const cex = orders.map(toCommonOrder);
  const dex = await dexDb.getDexOrdersAsync(pair, userId, DEX_CEX);
  res.json(combineCexWithDexOrders(cex, dex));
}

export async function getRecentTradeHistory(req: Request, res: Response, userId: string): Promise<void> {
  const side = getRequiredQueryParam(req, 'side');
  const limit = getQueryInt(req, 'limit', 10);
  const user = await tradingDb.getUserAsync(userId);
  await Promise.all(user.binance.map((p) => importRecentHistory(p.symbol, userId)));
  const orders = await binanceDb.getBinanceOrdersBySideAsync(side.toUpperCase(), limit, userId);
  res.json(orders.map(toCommonOrder));
}

export async function getRecentBuyAverages(_req: Request, res: Response, userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  const entries = await Promise.all(
    user.binance.map(async (pair) => {
      const orders = await binanceDb.getBinanceFilledOrdersAsync(pair.symbol, userId);
      return [pair.symbol, analyzeRecentBuyAverage(orders)] as const;
    })
  );
  res.json(Object.fromEntries(entries));
}

export async function createOrder(req: Request, res: Response): Promise<void> {
  const order = req.body as NewOrder;
  if (order.market) {
    const result = await createMarketOrder(order);
    res.json(result);
    return;
  }

  const price = parseFloat(order.price);
  if (Number.isNaN(price)) {
    throw new Error(`unexpected price value: ${order.price}`);
  }

  const ticker = await binanceClient.getTicker(order.currencyPair);
  const productInfo = await binanceClient.getExchangeInfo([order.currencyPair]);
  const product = productInfo[0] ? toCommonProduct(productInfo[0]) : undefined;

  if (ticker) {
    const tickerPrice = parseFloat(ticker.lastPrice);
    if (
      (order.side === 'buy' && price > tickerPrice) ||
      (order.side === 'sell' && price < tickerPrice)
    ) {
      const result = await createMarketOrder(order);
      res.json(result);
      return;
    }
  }

  const result = await createLimitOrder(order, price, product);
  res.json(result);
}

async function createMarketOrder(order: NewOrder): Promise<Record<string, unknown>> {
  const side =
    order.side === 'sell' ? SpotRestAPI.NewOrderSideEnum.SELL : SpotRestAPI.NewOrderSideEnum.BUY;
  const total = parseFloat(order.total);
  if (!Number.isNaN(total) && total > 0) {
    return binanceClient.createOrder({
      symbol: order.currencyPair,
      side,
      type: SpotRestAPI.NewOrderTypeEnum.MARKET,
      quoteOrderQty: total,
    });
  }
  const amount = parseFloat(order.amount);
  if (!Number.isNaN(amount) && amount > 0) {
    return binanceClient.createOrder({
      symbol: order.currencyPair,
      side,
      type: SpotRestAPI.NewOrderTypeEnum.MARKET,
      quantity: amount,
    });
  }
  throw new Error('either amount or total should be provided');
}

async function createLimitOrder(
  order: NewOrder,
  price: number,
  product?: Product
): Promise<Record<string, unknown>> {
  const side =
    order.side === 'sell' ? SpotRestAPI.NewOrderSideEnum.SELL : SpotRestAPI.NewOrderSideEnum.BUY;
  let quantity = parseFloat(order.amount);
  let limitPrice = price;
  if (product) {
    quantity = roundToSmallestUnit(quantity, product.minQuantity);
    limitPrice = roundToSmallestUnit(limitPrice, product.pricePrecision);
  }
  return binanceClient.createOrder({
    symbol: order.currencyPair,
    side,
    type: SpotRestAPI.NewOrderTypeEnum.LIMIT,
    timeInForce: SpotRestAPI.NewOrderTimeInForceEnum.GTC,
    quantity,
    price: limitPrice,
  });
}

function roundToSmallestUnit(num: number, smallestUnit: number): number {
  if (!smallestUnit || smallestUnit <= 0) {
    return num;
  }
  const factor = Math.round(1 / smallestUnit);
  return Math.round(num * factor) / factor;
}

export async function cancelOrder(req: Request, res: Response): Promise<void> {
  const body = req.body as CancelOrderRequest;
  const result = await binanceClient.cancelOrder(body.pair, body.id);
  res.json(result);
}

export async function addDexOrder(req: Request, res: Response, userId: string): Promise<void> {
  const order = req.body as NewOrder;
  const dexOrder = toNewDexOrder(order, DEX_CEX);
  const saved = await dexDb.upsertDexOrderAsync(dexOrder, userId);
  res.json(saved);
}

export async function updateRecentHistory(req: Request, res: Response, userId: string): Promise<void> {
  const pair = getRequiredQueryParam(req, 'pair');
  await importRecentHistory(pair, userId);
  res.status(200).send();
}

export async function importHistory(req: Request, res: Response, userId: string): Promise<void> {
  const pair = getRequiredQueryParam(req, 'pair');
  await importFullHistory(pair, userId);
  res.status(200).send();
}

export async function doSomeTechService(_req: Request, res: Response, userId: string): Promise<void> {
  await binanceDb.getBinanceAveragesAsync(userId);
  res.status(200).send();
}

async function importRecentHistory(pair: string, userId: string): Promise<void> {
  const raw = await binanceClient.fetchAllOrders(pair, 100);
  await upsertFilled(raw, userId);
}

async function importFullHistory(pair: string, userId: string): Promise<void> {
  const raw = await binanceClient.fetchAllOrders(pair);
  await upsertFilled(raw, userId);
}

async function upsertFilled(raw: Record<string, unknown>[], userId: string): Promise<void> {
  const filled = raw
    .filter((o) => o.status === 'FILLED')
    .map((o) => {
      const doc = docFromApiOrder(o);
      doc.id = doc.orderId;
      return doc;
    });
  if (filled.length > 0) {
    await binanceDb.upsertBinanceOrdersAsync(filled, userId);
  }
}

export async function syncAllUserPairs(userId: string): Promise<void> {
  const user = await tradingDb.getUserAsync(userId);
  for (const pair of user.binance) {
    if (!pair.isArchived) {
      await importRecentHistory(pair.symbol, userId);
    }
  }
}
