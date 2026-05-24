import { AverageSide, Order, OrderStatus, OrderType, Product, Ticker } from '../../../shared/models';
import { CryptoOrderDoc } from '../../../infra/crypto-db.service';

/** .NET Cosmos docs store CryptoOrderType / CryptoOrderSide as enum numbers. */
function isLimitOrderType(type: unknown): boolean {
  if (type === 1 || type === '1') {
    return true;
  }
  if (typeof type === 'string') {
    return type.toUpperCase() === 'LIMIT';
  }
  return false;
}

function normalizeOrderSide(side: unknown): 'buy' | 'sell' {
  if (side === 2 || side === '2') {
    return 'buy';
  }
  const text = String(side).toUpperCase();
  return text === 'BUY' ? 'buy' : 'sell';
}

function toCommonOrderStatus(status: unknown): OrderStatus {
  const numeric = typeof status === 'number' ? status : Number.parseInt(String(status), 10);
  if (!Number.isNaN(numeric)) {
    if (numeric === 1) return 'open'; // ACTIVE
    if (numeric === 3) return 'closed'; // FILLED
    return 'cancelled';
  }
  const text = String(status).toUpperCase();
  if (text === 'ACTIVE' || text === 'PENDING') return 'open';
  if (text === 'FILLED') return 'closed';
  return 'cancelled';
}

export function toCommonTicker(raw: { i: string; a: string; c: string }): Ticker {
  return {
    last: parseFloat(raw.a),
    change_percentage: parseFloat(raw.c) * 100,
  };
}

export function toCommonOrder(raw: CryptoOrderDoc): Order {
  const amount =
    parseFloat(raw.cumulative_quantity) > 0
      ? parseFloat(raw.cumulative_quantity)
      : parseFloat(raw.quantity);
  const isLimit = isLimitOrderType(raw.type);
  const price = isLimit ? parseFloat(raw.limit_price) : parseFloat(raw.avg_price);

  return {
    id: raw.order_id,
    currencyPair: raw.instrument_name,
    createTimestamp: raw.create_time,
    updateTimestamp: raw.update_time,
    side: normalizeOrderSide(raw.side),
    amount,
    price,
    status: toCommonOrderStatus(raw.status),
    type: isLimit ? 'limit' : 'market',
  };
}

export function apiToCryptoDoc(order: Record<string, unknown>): CryptoOrderDoc {
  const side = normalizeOrderSide(order.side);
  return {
    id: String(order.order_id),
    order_id: String(order.order_id),
    instrument_name: String(order.instrument_name),
    create_time: Number(order.create_time),
    update_time: Number(order.update_time),
    side: side === 'buy' ? 'BUY' : 'SELL',
    quantity: String(order.quantity ?? '0'),
    cumulative_quantity: String(order.cumulative_quantity ?? '0'),
    limit_price: String(order.limit_price ?? '0'),
    avg_price: String(order.avg_price ?? '0'),
    status: String(order.status ?? ''),
    type: isLimitOrderType(order.type) ? 'LIMIT' : 'MARKET',
  };
}

export function toCommonProduct(inst: {
  symbol: string;
  quote_decimals: number;
  qty_tick_size: string;
}): Product {
  return {
    currencyPair: inst.symbol,
    minQuantity: parseFloat(inst.qty_tick_size ?? '0'),
    minTotal: 0,
    pricePrecision: 1 / Math.pow(10, inst.quote_decimals ?? 8),
  };
}

export function analyzeRecentBuyAverage(orders: CryptoOrderDoc[]): AverageSide {
  const sellIndex = orders.findIndex((o) => normalizeOrderSide(o.side) === 'sell');
  const recentBuys = sellIndex === -1 ? orders : orders.slice(0, sellIndex);
  return recentBuys.reduce<AverageSide>(
    (acc, curr) => {
      const money = parseFloat((curr as CryptoOrderDoc & { cumulative_value?: string }).cumulative_value ?? '0') ||
        parseFloat(curr.avg_price) * parseFloat(curr.cumulative_quantity);
      acc.money += money;
      acc.volume += parseFloat(curr.cumulative_quantity);
      acc.price = acc.volume > 0 ? acc.money / acc.volume : 0;
      return acc;
    },
    { money: 0, price: 0, volume: 0 }
  );
}
