import { ApiClient, Order, SpotApi } from 'gate-api';
import { getExchangeApiKeys, SecretsKeys } from '../../../shared/secrets';

let spotApiPromise: Promise<SpotApi> | null = null;

async function getSpotApi(): Promise<SpotApi> {
  if (!spotApiPromise) {
    spotApiPromise = (async () => {
      const keys = await getExchangeApiKeys(SecretsKeys.GateApiKey);
      const client = new ApiClient();
      client.setApiKeySecret(keys.apiKey, keys.secretKey);
      return new SpotApi(client);
    })();
  }
  return spotApiPromise;
}

async function withGateError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as {
        response?: { status?: number; data?: { label?: string; message?: string } };
        message?: string;
      };
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;
      const detail =
        data?.label || data?.message
          ? `${data.label ?? 'ERROR'}: ${data.message ?? ''}`
          : JSON.stringify(data ?? axiosError.message);
      throw new Error(`Gate API failed (${status ?? 'unknown'}): ${detail}`);
    }
    throw error;
  }
}

export async function listTickers(): Promise<
  Array<{ currency_pair: string; last: string; change_percentage: string }>
> {
  return withGateError(async () => {
    const spotApi = await getSpotApi();
    const response = await spotApi.listTickers();
    return (response.body ?? []).map((t) => ({
      currency_pair: t.currencyPair ?? '',
      last: t.last ?? '0',
      change_percentage: t.changePercentage ?? '0',
    }));
  });
}

export async function listSpotAccounts(): Promise<
  Array<{ currency: string; available: string; locked: string }>
> {
  return withGateError(async () => {
    const spotApi = await getSpotApi();
    const response = await spotApi.listSpotAccounts();
    return (response.body ?? []).map((a) => ({
      currency: a.currency ?? '',
      available: a.available ?? '0',
      locked: a.locked ?? '0',
    }));
  });
}

export async function listOpenOrders(): Promise<Record<string, unknown>[]> {
  return withGateError(async () => {
    const spotApi = await getSpotApi();
    const response = await spotApi.listAllOpenOrders();
    const orders: Record<string, unknown>[] = [];
    for (const group of response.body ?? []) {
      for (const order of group.orders ?? []) {
        orders.push(order as unknown as Record<string, unknown>);
      }
    }
    return orders;
  });
}

export async function listCurrencyPairs(): Promise<
  Array<{
    id: string;
    minBaseAmount?: string;
    minQuoteAmount?: string;
    precision?: number;
  }>
> {
  return withGateError(async () => {
    const spotApi = await getSpotApi();
    const response = await spotApi.listCurrencyPairs();
    return (response.body ?? []).map((p) => ({
      id: p.id ?? '',
      minBaseAmount: p.minBaseAmount,
      minQuoteAmount: p.minQuoteAmount,
      precision: p.precision,
    }));
  });
}

export async function listOrders(
  currencyPair: string,
  from?: number,
  to?: number
): Promise<Record<string, unknown>[]> {
  return withGateError(async () => {
    const spotApi = await getSpotApi();
    const response = await spotApi.listOrders(currencyPair, 'finished', { from, to });
    return (response.body ?? []) as unknown as Record<string, unknown>[];
  });
}

export async function createOrder(order: Order): Promise<Record<string, unknown>> {
  return withGateError(async () => {
    const spotApi = await getSpotApi();
    const response = await spotApi.createOrder(order);
    return (response.body ?? {}) as unknown as Record<string, unknown>;
  });
}

export async function cancelOrder(orderId: string, currencyPair: string): Promise<void> {
  await withGateError(async () => {
    const spotApi = await getSpotApi();
    await spotApi.cancelOrder(orderId, currencyPair);
  });
}

export async function getTicker(currencyPair: string): Promise<{ last: string } | null> {
  return withGateError(async () => {
    const spotApi = await getSpotApi();
    const response = await spotApi.listTickers({ currencyPair });
    const item = response.body?.[0];
    return item ? { last: item.last ?? '0' } : null;
  });
}
