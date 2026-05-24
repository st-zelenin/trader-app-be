import { Spot, SpotRestAPI } from '@binance/spot';
import { getExchangeApiKeys, SecretsKeys } from '../../../shared/secrets';
import { logger } from '../../../utils/logger';
import { wireBinanceRestConfiguration } from './binance-sdk-patch';

let clientPromise: Promise<Spot> | null = null;

async function getClient(): Promise<Spot> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const keys = await getExchangeApiKeys(SecretsKeys.BinanceApiKey);
      const client = new Spot({
        configurationRestAPI: {
          apiKey: keys.apiKey,
          apiSecret: keys.secretKey,
          basePath: 'https://api.binance.com',
          compression: false,
          timeout: 30_000,
        },
      });
      wireBinanceRestConfiguration(client);
      return client;
    })();
  }
  return clientPromise;
}

function normalizeSymbols(symbols: string[]): string[] {
  return symbols.map((s) => String(s ?? '').trim()).filter(Boolean);
}

async function readRestData<T>(response: { data: () => Promise<T> }): Promise<T> {
  return response.data();
}

function isSpotTradingSymbol(symbol: {
  status?: string;
  quoteAsset?: string;
  permissions?: string[];
  permissionSets?: string[][];
}): boolean {
  if (symbol.status !== 'TRADING') {
    return false;
  }
  if (symbol.quoteAsset !== 'USDT' && symbol.quoteAsset !== 'USDC') {
    return false;
  }
  const permissions = symbol.permissions ?? [];
  if (permissions.length > 0) {
    return permissions.includes('SPOT');
  }
  const permissionSets = symbol.permissionSets ?? [];
  if (permissionSets.length > 0) {
    return permissionSets.some((set) => set.includes('SPOT'));
  }
  return true;
}

export async function getTickers24hr(symbols: string[]): Promise<
  Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>
> {
  const normalized = normalizeSymbols(symbols);
  if (normalized.length === 0) {
    return [];
  }

  const client = await getClient();
  const response =
    normalized.length === 1
      ? await client.restAPI.ticker24hr({ symbol: normalized[0] })
      : await client.restAPI.ticker24hr({ symbols: normalized });
  const data = await readRestData(response);
  const list = Array.isArray(data) ? data : [data];
  return list.map((t) => ({
    symbol: t.symbol ?? '',
    lastPrice: t.lastPrice ?? '0',
    priceChangePercent: t.priceChangePercent ?? '0',
  }));
}

export async function getUserBalances(): Promise<
  Array<{ asset: string; free: string; locked: string }>
> {
  const client = await getClient();
  const response = await client.restAPI.getAccount();
  const data = await readRestData(response);
  return (data.balances ?? [])
    .filter((b) => parseFloat(b.free ?? '0') > 0 || parseFloat(b.locked ?? '0') > 0)
    .map((b) => ({
      asset: b.asset ?? '',
      free: b.free ?? '0',
      locked: b.locked ?? '0',
    }));
}

export async function getOpenOrders(): Promise<Record<string, unknown>[]> {
  const client = await getClient();
  const response = await client.restAPI.getOpenOrders();
  const data = await readRestData(response);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

export async function getExchangeInfo(symbols: string[]): Promise<
  Array<{ symbol: string; filters: Array<Record<string, unknown>> }>
> {
  const normalized = normalizeSymbols(symbols);
  const client = await getClient();
  const response =
    normalized.length === 0
      ? await client.restAPI.exchangeInfo({})
      : normalized.length === 1
        ? await client.restAPI.exchangeInfo({ symbol: normalized[0] })
        : await client.restAPI.exchangeInfo({ symbols: normalized });
  const data = await readRestData(response);
  return (data.symbols ?? []) as Array<{
    symbol: string;
    filters: Array<Record<string, unknown>>;
  }>;
}

export async function getAllSpotSymbols(): Promise<string[]> {
  const client = await getClient();
  const response = await client.restAPI.exchangeInfo({});
  const data = await readRestData(response);
  return (
    data.symbols
      ?.filter(isSpotTradingSymbol)
      .map((s) => s.symbol ?? '')
      .filter(Boolean) ?? []
  );
}

export async function fetchAllOrders(symbol: string, limit?: number): Promise<Record<string, unknown>[]> {
  const client = await getClient();
  const params: { symbol: string; limit?: number } = { symbol };
  if (limit) {
    params.limit = limit;
  }
  const response = await client.restAPI.allOrders(params);
  const data = await readRestData(response);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

export async function createOrder(params: SpotRestAPI.NewOrderRequest): Promise<Record<string, unknown>> {
  const client = await getClient();
  const response = await client.restAPI.newOrder(params);
  const data = await readRestData(response);
  return data as unknown as Record<string, unknown>;
}

export async function cancelOrder(symbol: string, orderId: string): Promise<Record<string, unknown>> {
  const client = await getClient();
  const response = await client.restAPI.deleteOrder({ symbol, orderId: parseInt(orderId, 10) });
  const data = await readRestData(response);
  return data as unknown as Record<string, unknown>;
}

export async function getTicker(symbol: string): Promise<{ lastPrice: string } | null> {
  try {
    const client = await getClient();
    const response = await client.restAPI.ticker24hr({ symbol: String(symbol).trim() });
    const data = await readRestData(response);
    const item = Array.isArray(data) ? data[0] : data;
    return item ? { lastPrice: item.lastPrice ?? '0' } : null;
  } catch (error) {
    logger.warn('binance ticker fetch failed', { symbol, error });
    return null;
  }
}
