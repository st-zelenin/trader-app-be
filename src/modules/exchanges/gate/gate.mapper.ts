import { AverageSide, Order, OrderStatus, OrderType, Product, Ticker } from '../../../shared/models';
import { GateOrderDoc } from '../../../infra/gate-db.service';

export function toCommonTicker(raw: { currency_pair: string; last: string; change_percentage: string }): Ticker {
  return {
    last: parseFloat(raw.last),
    change_percentage: parseFloat(raw.change_percentage),
  };
}

export function toCommonOrder(raw: GateOrderDoc): Order {
  const isMarket = raw.type === 'market';
  let amount = parseFloat(raw.amount);
  if (raw.status === 'closed' && isMarket && raw.side === 'buy') {
    const avg = parseFloat(raw.avg_deal_price);
    amount = avg > 0 ? parseFloat(raw.filled_total) / avg : amount;
  }
  const price =
    isMarket && parseFloat(raw.avg_deal_price) > 0
      ? parseFloat(raw.avg_deal_price)
      : parseFloat(raw.price);

  return {
    id: raw.id,
    currencyPair: raw.currency_pair,
    createTimestamp: raw.create_time_ms,
    updateTimestamp: raw.update_time_ms,
    side: raw.side === 'buy' ? 'buy' : 'sell',
    amount,
    price,
    status: toCommonOrderStatus(raw.status),
    type: raw.type === 'limit' ? 'limit' : 'market',
  };
}

function toCommonOrderStatus(status: string): OrderStatus {
  if (status === 'open') return 'open';
  if (status === 'closed') return 'closed';
  return 'cancelled';
}

export function apiToGateDoc(order: Record<string, unknown>): GateOrderDoc {
  return {
    id: String(order.id),
    currency_pair: String(order.currency_pair ?? order.currencyPair),
    create_time_ms: Number(order.create_time_ms ?? order.createTimeMs ?? Date.now()),
    update_time_ms: Number(order.update_time_ms ?? order.updateTimeMs ?? Date.now()),
    side: String(order.side),
    amount: String(order.amount ?? '0'),
    price: String(order.price ?? '0'),
    filled_total: String(order.filled_total ?? order.filledTotal ?? '0'),
    avg_deal_price: String(order.avg_deal_price ?? order.avgDealPrice ?? '0'),
    status: String(order.status),
    type: String(order.type ?? 'limit'),
  };
}

export function toCommonProduct(pair: {
  id: string;
  minBaseAmount?: string;
  minQuoteAmount?: string;
  precision?: number;
}): Product {
  const priceDecimals = pair.precision ?? 8;
  return {
    currencyPair: pair.id,
    minQuantity: parseFloat(pair.minBaseAmount ?? '0'),
    minTotal: parseFloat(pair.minQuoteAmount ?? '0'),
    pricePrecision: 1 / Math.pow(10, priceDecimals),
  };
}

export function analyzeRecentBuyAverage(orders: GateOrderDoc[]): AverageSide {
  const sellIndex = orders.findIndex((o) => o.side === 'sell');
  const recentBuys = sellIndex === -1 ? orders : orders.slice(0, sellIndex);
  return recentBuys.reduce<AverageSide>(
    (acc, curr) => {
      const isMarket = curr.type === 'market';
      const volume = isMarket && curr.side === 'buy'
        ? parseFloat(curr.filled_total) / parseFloat(curr.avg_deal_price)
        : parseFloat(curr.amount);
      acc.volume += volume;
      acc.money += parseFloat(curr.filled_total) || parseFloat(curr.amount) * parseFloat(curr.price);
      acc.price = acc.volume > 0 ? acc.money / acc.volume : 0;
      return acc;
    },
    { money: 0, price: 0, volume: 0 }
  );
}
