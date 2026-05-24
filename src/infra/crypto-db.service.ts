import { CryptoAverage } from '../shared/models';
import { executeReadQuery, getContainer } from './cosmos-client';

const DB_NAME = 'crypto';

export interface CryptoOrderDoc {
  id: string;
  order_id: string;
  instrument_name: string;
  create_time: number;
  update_time: number;
  side: string | number;
  quantity: string;
  cumulative_quantity: string;
  limit_price: string;
  avg_price: string;
  status: string | number;
  type: string | number;
}

async function userContainer(containerId: string) {
  return getContainer(DB_NAME, containerId, '/instrument_name');
}

export async function getCryptoAveragesAsync(containerId: string): Promise<CryptoAverage[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<CryptoAverage>(
    container,
    "SELECT SUM(StringToNumber(c.cumulative_value)) AS total_money, SUM(StringToNumber(c.cumulative_quantity)) AS total_volume, c.side, c.instrument_name AS currency_pair FROM c WHERE c.status = 'FILLED' GROUP BY c.side, c.instrument_name"
  );
}

export async function getCryptoOrdersAsync(pair: string, containerId: string): Promise<CryptoOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<CryptoOrderDoc>(container, {
    query: 'SELECT * FROM c WHERE c.instrument_name = @pair ORDER BY c.update_time DESC',
    parameters: [{ name: '@pair', value: pair }],
  });
}

export async function getCryptoFilledOrdersAsync(pair: string, containerId: string): Promise<CryptoOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<CryptoOrderDoc>(container, {
    query:
      'SELECT * FROM c WHERE c.instrument_name = @pair AND c.status = "FILLED" ORDER BY c.update_time DESC',
    parameters: [{ name: '@pair', value: pair }],
  });
}

export async function getCryptoOrdersBySideAsync(
  side: string,
  limit: number,
  containerId: string
): Promise<CryptoOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<CryptoOrderDoc>(container, {
    query:
      'SELECT * FROM c WHERE c.status = "FILLED" AND c.side = @side ORDER BY c.update_time DESC OFFSET 0 LIMIT @limit',
    parameters: [
      { name: '@side', value: side.toUpperCase() },
      { name: '@limit', value: limit },
    ],
  });
}

export async function upsertCryptoOrdersAsync(orders: CryptoOrderDoc[], containerId: string): Promise<void> {
  const container = await userContainer(containerId);
  await Promise.all(orders.map((order) => container.items.upsert(order)));
}
