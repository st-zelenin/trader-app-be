import { CryptoAverage } from '../shared/models';
import { executeReadQuery, getContainer } from './cosmos-client';

const DB_NAME = 'bybit';

export interface BybitOrderDoc {
  id: string;
  orderId: string;
  symbol: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  avgPrice: string;
  status: string;
  type: string;
  side: string;
  time: string;
  updateTime: string;
}

async function userContainer(containerId: string) {
  return getContainer(DB_NAME, containerId, '/symbol');
}

export async function getBybitAveragesAsync(containerId: string): Promise<CryptoAverage[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<CryptoAverage>(
    container,
    "SELECT SUM(c.type = 'MARKET' ? (StringToNumber(c.executedQty) * StringToNumber(c.avgPrice)) : StringToNumber(c.cummulativeQuoteQty)) AS total_money, SUM(StringToNumber(c.executedQty)) AS total_volume, c.side, c.symbol AS currency_pair FROM c WHERE c.status = 'FILLED' OR c.status = 'PARTIALLY_FILLED' GROUP BY c.side, c.symbol"
  );
}

export async function getBybitOrdersAsync(pair: string, containerId: string): Promise<BybitOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<BybitOrderDoc>(container, {
    query: 'SELECT * FROM c WHERE c.symbol = @pair ORDER BY c.updateTime DESC',
    parameters: [{ name: '@pair', value: pair }],
  });
}

export async function getBybitFilledOrdersAsync(pair: string, containerId: string): Promise<BybitOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<BybitOrderDoc>(container, {
    query: 'SELECT * FROM c WHERE c.symbol = @pair AND c.status = "FILLED" ORDER BY c.updateTime DESC',
    parameters: [{ name: '@pair', value: pair }],
  });
}

export async function getBybitOrdersBySideAsync(
  side: string,
  limit: number,
  containerId: string
): Promise<BybitOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<BybitOrderDoc>(container, {
    query:
      'SELECT * FROM c WHERE c.status = "FILLED" AND UPPER(c.side) = @side ORDER BY c.updateTime DESC OFFSET 0 LIMIT @limit',
    parameters: [
      { name: '@side', value: side.toUpperCase() },
      { name: '@limit', value: limit },
    ],
  });
}

export async function upsertBybitOrdersAsync(orders: BybitOrderDoc[], containerId: string): Promise<void> {
  const container = await userContainer(containerId);
  await Promise.all(orders.map((order) => container.items.upsert(order)));
}
