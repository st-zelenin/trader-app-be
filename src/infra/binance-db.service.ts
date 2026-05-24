import { executeReadQuery, getContainer } from './cosmos-client';
import { CryptoAverage } from '../shared/models';

const DB_NAME = 'binance';

async function userContainer(containerId: string) {
  return getContainer(DB_NAME, containerId, '/symbol');
}

export interface BinanceOrderDoc {
  id: string;
  symbol: string;
  orderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  type: string;
  side: string;
  time: string;
  updateTime: string;
}

export async function getBinanceAveragesAsync(containerId: string): Promise<CryptoAverage[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<CryptoAverage>(
    container,
    "SELECT SUM(StringToNumber(c.cummulativeQuoteQty)) AS total_money, SUM(StringToNumber(c.executedQty)) AS total_volume, c.side, c.symbol AS currency_pair FROM c WHERE c.status = 'FILLED' GROUP BY c.side, c.symbol"
  );
}

export async function getBinanceOrdersAsync(pair: string, containerId: string): Promise<BinanceOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<BinanceOrderDoc>(container, {
    query: 'SELECT * FROM c WHERE c.symbol = @pair ORDER BY c.updateTime DESC',
    parameters: [{ name: '@pair', value: pair }],
  });
}

export async function getBinanceFilledOrdersAsync(
  pair: string,
  containerId: string
): Promise<BinanceOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<BinanceOrderDoc>(container, {
    query:
      'SELECT * FROM c WHERE c.symbol = @pair AND c.status = "FILLED" ORDER BY c.updateTime DESC',
    parameters: [{ name: '@pair', value: pair }],
  });
}

export async function getBinanceOrdersBySideAsync(
  side: string,
  limit: number,
  containerId: string
): Promise<BinanceOrderDoc[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<BinanceOrderDoc>(container, {
    query:
      'SELECT * FROM c WHERE c.status = "FILLED" AND c.side = @side ORDER BY c.updateTime DESC OFFSET 0 LIMIT @limit',
    parameters: [
      { name: '@side', value: side },
      { name: '@limit', value: limit },
    ],
  });
}

export async function upsertBinanceOrdersAsync(
  orders: BinanceOrderDoc[],
  containerId: string
): Promise<void> {
  const container = await userContainer(containerId);
  await Promise.all(orders.map((order) => container.items.upsert(order)));
}
