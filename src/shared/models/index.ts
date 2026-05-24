export const Exchanges = {
  GateIo: 'GATE_IO',
  CryptoCom: 'CRYPTO_COM',
  Coinbase: 'COINBASE',
  ByBit: 'BYBIT',
  Binance: 'BINANCE',
} as const;

export type ExchangeId = 'binance' | 'bybit' | 'crypto' | 'gate';

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'closed' | 'open' | 'cancelled';
export type OrderType = 'limit' | 'market';
export type CommonOrderSides = 'buy' | 'sell';

export interface Order {
  id: string;
  currencyPair: string;
  createTimestamp: number;
  updateTimestamp: number;
  side: OrderSide;
  amount: number;
  price: number;
  status: OrderStatus;
  type: OrderType;
  associatedCex?: string;
  isDex?: boolean;
}

export interface NewOrder {
  currencyPair: string;
  side: CommonOrderSides;
  amount: string;
  price: string;
  total: string;
  market?: boolean;
}

export interface Balance {
  available: number;
  locked: number;
}

export interface Ticker {
  last: number;
  change_percentage: number;
}

export interface AverageSide {
  money: number;
  volume: number;
  price: number;
}

export interface Average {
  buy: AverageSide;
  sell: AverageSide;
}

/** Matches Common.Models.Product / trader-app-gui Product (Azure Functions parity). */
export interface Product {
  currencyPair: string;
  minQuantity: number;
  minTotal: number;
  /** Price step size (e.g. 0.00001), not a decimal-place count. */
  pricePrecision: number;
}

export interface CryptoAverage {
  total_money: number;
  total_volume: number;
  side: string;
  currency_pair: string;
}

export interface CryptoPair {
  symbol: string;
  isArchived: boolean;
}

export interface Trader {
  id: string;
  name: string;
  gate: CryptoPair[];
  crypto: CryptoPair[];
  coinbase: CryptoPair[];
  bybit: CryptoPair[];
  binance: CryptoPair[];
}

export interface AzureUser {
  oid: string;
  name: string;
}

export interface ExchangeSymbol {
  symbol: string;
  exchange: string;
}

export interface OrderedSymbols {
  exchange: string;
  symbols: string[];
}

export interface ExchangeApiKeysSecret {
  apiKey: string;
  secretKey: string;
}

export interface CancelOrderRequest {
  id: string;
  pair: string;
}

export function toNewDexOrder(order: NewOrder, associatedCex: string): Order {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    currencyPair: order.currencyPair,
    createTimestamp: now,
    updateTimestamp: now,
    side: order.side,
    amount: parseFloat(order.amount),
    price: parseFloat(order.price),
    status: 'closed',
    type: 'market',
    associatedCex,
    isDex: true,
  };
}
