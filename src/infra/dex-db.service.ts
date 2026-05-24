import { CryptoAverage, Order } from '../shared/models';
import { executeReadQuery, getContainer } from './cosmos-client';

const DB_NAME = 'dex';

async function userContainer(containerId: string) {
  return getContainer(DB_NAME, containerId, '/currencyPair');
}

export async function getDexAveragesAsync(
  containerId: string,
  associatedCex: string
): Promise<CryptoAverage[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<CryptoAverage>(container, {
    query:
      'SELECT SUM(c.amount * c.price) AS total_money, SUM(c.amount) AS total_volume, c.side, c.currencyPair AS currency_pair FROM c WHERE c.associatedCex = @associatedCex GROUP BY c.side, c.currencyPair',
    parameters: [{ name: '@associatedCex', value: associatedCex }],
  });
}

export async function getDexOrdersAsync(
  pair: string,
  containerId: string,
  associatedCex: string
): Promise<Order[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<Order>(container, {
    query:
      'SELECT * FROM c WHERE c.currencyPair = @pair AND c.associatedCex = @associatedCex ORDER BY c.updateTimestamp DESC',
    parameters: [
      { name: '@pair', value: pair },
      { name: '@associatedCex', value: associatedCex },
    ],
  });
}

export async function getDexOrdersBySideAsync(
  side: string,
  containerId: string,
  associatedCex: string
): Promise<Order[]> {
  const container = await userContainer(containerId);
  return executeReadQuery<Order>(container, {
    query:
      'SELECT * FROM c WHERE c.side = @side AND c.associatedCex = @associatedCex ORDER BY c.updateTimestamp DESC',
    parameters: [
      { name: '@side', value: side },
      { name: '@associatedCex', value: associatedCex },
    ],
  });
}

export async function upsertDexOrderAsync(order: Order, containerId: string): Promise<Order> {
  const container = await userContainer(containerId);
  const { resource } = await container.items.upsert(order);
  if (!resource) {
    throw new Error('failed to upsert dex order');
  }
  return resource as unknown as Order;
}
