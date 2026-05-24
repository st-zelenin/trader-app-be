import { AverageSide, Order, OrderSide, OrderStatus, OrderType, Product, Ticker } from '../../../shared/models';
import { BinanceOrderDoc } from '../../../infra/binance-db.service';

export function toCommonTicker(raw: { symbol: string; lastPrice: string; priceChangePercent: string }): Ticker {
  return {
    last: parseFloat(raw.lastPrice),
    change_percentage: parseFloat(raw.priceChangePercent),
  };
}

export function toCommonOrder(raw: BinanceOrderDoc): Order {
  let amount = parseFloat(raw.executedQty);
  if (Number.isNaN(amount) || amount <= 0) {
    amount = parseFloat(raw.origQty);
  }

  const isLimit = raw.type === 'LIMIT' || raw.type === 'TAKE_PROFIT_LIMIT';
  let price: number;
  if (isLimit) {
    price = parseFloat(raw.price);
  } else {
    const exec = parseFloat(raw.executedQty);
    price = exec > 0 ? parseFloat(raw.cummulativeQuoteQty) / exec : parseFloat(raw.price);
  }

  return {
    id: raw.orderId,
    currencyPair: raw.symbol,
    createTimestamp: parseInt(raw.time, 10),
    updateTimestamp: parseInt(raw.updateTime, 10),
    side: raw.side === 'BUY' ? 'buy' : 'sell',
    amount,
    price,
    status: toCommonOrderStatus(raw.status),
    type: isLimit ? 'limit' : 'market',
  };
}

function toCommonOrderStatus(status: string): OrderStatus {
  switch (status) {
    case 'NEW':
    case 'PARTIALLY_FILLED':
      return 'open';
    case 'FILLED':
      return 'closed';
    default:
      return 'cancelled';
  }
}

function filterField(
  filters: Array<Record<string, unknown>>,
  filterType: string,
  field: string
): string | undefined {
  const filter = filters.find((f) => f.filterType === filterType);
  const value = filter?.[field];
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value);
}

export function toCommonProduct(symbolInfo: {
  symbol: string;
  filters: Array<Record<string, unknown>>;
}): Product {
  const filters = symbolInfo.filters ?? [];
  const minNotional =
    filterField(filters, 'NOTIONAL', 'minNotional') ??
    filterField(filters, 'MIN_NOTIONAL', 'minNotional');
  const minQty = filterField(filters, 'LOT_SIZE', 'minQty') ?? '0';
  const priceStep =
    filterField(filters, 'PRICE_FILTER', 'minPrice') ??
    filterField(filters, 'PRICE_FILTER', 'tickSize') ??
    '0.01';

  return {
    currencyPair: symbolInfo.symbol,
    minQuantity: parseFloat(minQty),
    minTotal: parseFloat(minNotional ?? '0'),
    pricePrecision: parseFloat(priceStep),
  };
}

export function analyzeRecentBuyAverage(orders: BinanceOrderDoc[]): AverageSide {
  const sellIndex = orders.findIndex((o) => o.side === 'SELL');
  const recentBuys = sellIndex === -1 ? orders : orders.slice(0, sellIndex);
  return recentBuys.reduce<AverageSide>(
    (acc, curr) => {
      acc.money += parseFloat(curr.cummulativeQuoteQty);
      acc.volume += parseFloat(curr.executedQty);
      acc.price = acc.volume > 0 ? acc.money / acc.volume : 0;
      return acc;
    },
    { money: 0, price: 0, volume: 0 }
  );
}

export function docFromApiOrder(order: Record<string, unknown>): BinanceOrderDoc {
  return {
    id: String(order.orderId),
    symbol: String(order.symbol),
    orderId: String(order.orderId),
    price: String(order.price ?? '0'),
    origQty: String(order.origQty ?? '0'),
    executedQty: String(order.executedQty ?? '0'),
    cummulativeQuoteQty: String(order.cummulativeQuoteQty ?? '0'),
    status: String(order.status),
    type: String(order.type),
    side: String(order.side),
    time: String(order.time ?? order.transactTime ?? Date.now()),
    updateTime: String(order.updateTime ?? order.time ?? Date.now()),
  };
}
