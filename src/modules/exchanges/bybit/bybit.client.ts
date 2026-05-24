import { RestClientV5 } from 'bybit-api';
import { getExchangeApiKeys, SecretsKeys } from '../../../shared/secrets';

let clientPromise: Promise<RestClientV5> | null = null;

async function getClient(): Promise<RestClientV5> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const keys = await getExchangeApiKeys(SecretsKeys.ByBitApiKey);
      return new RestClientV5({ key: keys.apiKey, secret: keys.secretKey });
    })();
  }
  return clientPromise;
}

export async function getTickers(symbols: string[]): Promise<
  Array<{ symbol: string; lastPrice: string; price24hPcnt: string }>
> {
  if (symbols.length === 0) {
    return [];
  }
  const client = await getClient();
  // Bybit does not support comma-separated symbols; fetch all spot tickers and filter (.NET parity).
  const response = await client.getTickers({ category: 'spot' });
  const wanted = new Set(symbols);
  const list = response.result.list ?? [];
  return list
    .filter((t) => t.symbol != null && wanted.has(t.symbol))
    .map((t) => ({
      symbol: t.symbol!,
      lastPrice: t.lastPrice ?? '0',
      price24hPcnt: t.price24hPcnt ?? '0',
    }));
}

export async function getWalletBalances(): Promise<Array<{ coin: string; free: string; locked: string }>> {
  const client = await getClient();
  const response = await client.getWalletBalance({ accountType: 'UNIFIED' });
  const coins =
    response.result.list?.[0]?.coin?.map((c) => ({
      coin: c.coin,
      free: c.walletBalance,
      locked: c.locked,
    })) ?? [];
  return coins;
}

export async function getOpenOrders(): Promise<Record<string, unknown>[]> {
  const client = await getClient();
  const response = await client.getActiveOrders({ category: 'spot' });
  return (response.result.list ?? []) as unknown as Record<string, unknown>[];
}

export async function getInstrumentsInfo(): Promise<Record<string, unknown>[]> {
  const client = await getClient();
  const response = await client.getInstrumentsInfo({ category: 'spot' });
  return (response.result.list ?? []) as unknown as Record<string, unknown>[];
}

export async function getOrderHistory(symbol: string, limit?: number): Promise<Record<string, unknown>[]> {
  const client = await getClient();
  const params: { category: 'spot'; symbol: string; limit?: number } = { category: 'spot', symbol };
  if (limit) {
    params.limit = limit;
  }
  const response = await client.getHistoricOrders(params);
  return (response.result.list ?? []) as unknown as Record<string, unknown>[];
}

export async function submitOrder(
  params: Parameters<RestClientV5['submitOrder']>[0]
): Promise<Record<string, unknown>> {
  const client = await getClient();
  const response = await client.submitOrder(params);
  return (response.result ?? {}) as unknown as Record<string, unknown>;
}

export async function cancelOrder(symbol: string, orderId: string): Promise<Record<string, unknown>> {
  const client = await getClient();
  const response = await client.cancelOrder({ category: 'spot', symbol, orderId });
  return (response.result ?? {}) as unknown as Record<string, unknown>;
}

export async function getTicker(symbol: string): Promise<{ lastPrice: string } | null> {
  const client = await getClient();
  const response = await client.getTickers({ category: 'spot', symbol });
  const item = response.result.list?.[0];
  return item ? { lastPrice: item.lastPrice } : null;
}
