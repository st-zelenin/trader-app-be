import { CryptoAverage } from '../shared/models';
import { executeReadQuery, getContainer } from './cosmos-client';

/** Mirrors gate.mapper toCommonOrder() for closed orders (same math as GetHistory). */
const GATE_AVERAGES_QUERY =
  "SELECT " +
  "SUM((c.type = 'market' AND c.side = 'buy' AND StringToNumber(c.avg_deal_price) > 0) " +
  "? StringToNumber(c.filled_total) " +
  ": (c.type = 'market' AND StringToNumber(c.avg_deal_price) > 0) " +
  "? StringToNumber(c.amount) * StringToNumber(c.avg_deal_price) " +
  ": StringToNumber(c.amount) * StringToNumber(c.price)) AS total_money, " +
  "SUM((c.type = 'market' AND c.side = 'buy' AND StringToNumber(c.avg_deal_price) > 0) " +
  "? StringToNumber(c.filled_total) / StringToNumber(c.avg_deal_price) " +
  ": StringToNumber(c.amount)) AS total_volume, " +
  "c.side, c.currency_pair " +
  "FROM c WHERE c.status = 'closed' GROUP BY c.side, c.currency_pair";

const DB_NAME = 'gate';

export interface GateOrderDoc {
  id: string;
  currency_pair: string;
  create_time_ms: number;
  update_time_ms: number;
  side: string;
  amount: string;
  price: string;
  filled_total: string;
  avg_deal_price: string;
  status: string;
  type: string;
}

async function userContainer(containerId: string) {
  return getContainer(DB_NAME, containerId, '/currency_pair');
}

export async function getGateAveragesAsync(containerId: string): Promise<CryptoAverage[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<CryptoAverage>(container, GATE_AVERAGES_QUERY);
}

export async function getGateOrdersAsync(pair: string, containerId: string): Promise<GateOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<GateOrderDoc>(container, {
    query: 'SELECT * FROM c WHERE c.currency_pair = @pair ORDER BY c.update_time_ms DESC',
    parameters: [{ name: '@pair', value: pair }],
  });
}

export async function getGateFilledOrdersAsync(pair: string, containerId: string): Promise<GateOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<GateOrderDoc>(container, {
    query:
      'SELECT * FROM c WHERE c.currency_pair = @pair AND c.status = "closed" ORDER BY c.update_time_ms DESC',
    parameters: [{ name: '@pair', value: pair }],
  });
}

export async function getGateOrdersBySideAsync(
  side: string,
  limit: number,
  containerId: string
): Promise<GateOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<GateOrderDoc>(container, {
    query:
      'SELECT * FROM c WHERE c.status = "closed" AND c.side = @side ORDER BY c.update_time DESC OFFSET 0 LIMIT @limit',
    parameters: [
      { name: '@side', value: side.toLowerCase() },
      { name: '@limit', value: limit },
    ],
  });
}

export async function upsertGateOrdersAsync(orders: GateOrderDoc[], containerId: string): Promise<void> {
  const container = await userContainer(containerId);
  await Promise.all(orders.map((order) => container.items.upsert(order)));
}
