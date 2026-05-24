import { AverageSide, Order, OrderStatus, OrderType, Product, Ticker } from '../../../shared/models';
import { BybitOrderDoc } from '../../../infra/bybit-db.service';

export function toCommonTicker(raw: { symbol: string; lastPrice: string; price24hPcnt: string }): Ticker {
  return {
    last: parseFloat(raw.lastPrice),
    change_percentage: parseFloat(raw.price24hPcnt) * 100,
  };
}

export function toCommonOrder(raw: BybitOrderDoc): Order {
  let amount = parseFloat(raw.executedQty);
  if (Number.isNaN(amount) || amount <= 0) {
    amount = parseFloat(raw.origQty);
  }
  const isMarket = raw.type === 'MARKET';
  const price = isMarket ? parseFloat(raw.avgPrice) : parseFloat(raw.price);

  return {
    id: raw.orderId,
    currencyPair: raw.symbol,
    createTimestamp: parseInt(raw.time, 10),
    updateTimestamp: parseInt(raw.updateTime, 10),
    side: raw.side.toLowerCase() === 'buy' ? 'buy' : 'sell',
    amount,
    price,
    status: toCommonOrderStatus(raw.status, raw.type),
    type: raw.type === 'LIMIT' ? 'limit' : 'market',
  };
}

function toCommonOrderStatus(status: string, type: string): OrderStatus {
  switch (status) {
    case 'NEW':
    case 'PARTIALLY_FILLED':
    case 'PENDING_NEW':
      return 'open';
    case 'FILLED':
      return 'closed';
    case 'CANCELED':
      return type === 'MARKET' ? 'closed' : 'cancelled';
    default:
      return 'cancelled';
  }
}

export function v5ToBybitDoc(order: Record<string, unknown>): BybitOrderDoc {
  const cumExec = String(order.cumExecQty ?? '0');
  const avgPrice = String(order.avgPrice ?? order.price ?? '0');
  const price = String(order.price ?? '0');
  const cummulativeQuoteQty = String(parseFloat(cumExec) * parseFloat(avgPrice));
  return {
    id: String(order.orderId),
    orderId: String(order.orderId),
    symbol: String(order.symbol),
    price,
    origQty: String(order.qty ?? '0'),
    executedQty: cumExec,
    cummulativeQuoteQty,
    avgPrice,
    status: mapV5Status(String(order.orderStatus)),
    type: String(order.orderType ?? 'Limit').toUpperCase(),
    side: String(order.side ?? 'Buy'),
    time: String(order.createdTime ?? Date.now()),
    updateTime: String(order.updatedTime ?? order.createdTime ?? Date.now()),
  };
}

function mapV5Status(status: string): string {
  if (status === 'Filled') return 'FILLED';
  if (status === 'PartiallyFilledCanceled') return 'PARTIALLY_FILLED';
  if (status === 'Cancelled') return 'CANCELED';
  return status.toUpperCase();
}

export function toCommonProduct(info: {
  symbol: string;
  lotSizeFilter?: { minOrderQty?: string; minOrderAmt?: string };
  priceFilter?: { tickSize?: string };
}): Product {
  const lot = info.lotSizeFilter;
  const price = info.priceFilter;
  return {
    currencyPair: info.symbol,
    minQuantity: parseFloat(lot?.minOrderQty ?? '0'),
    minTotal: parseFloat(lot?.minOrderAmt ?? '0'),
    pricePrecision: parseFloat(price?.tickSize ?? '0.01'),
  };
}

export function analyzeRecentBuyAverage(orders: BybitOrderDoc[]): AverageSide {
  const sellIndex = orders.findIndex((o) => o.side.toLowerCase() === 'sell');
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
