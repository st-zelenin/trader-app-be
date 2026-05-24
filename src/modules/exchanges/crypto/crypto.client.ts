import crypto from 'crypto';
import { getExchangeApiKeys, SecretsKeys } from '../../../shared/secrets';

const BASE_URL = 'https://api.crypto.com/exchange/v1';

let apiKeysPromise: ReturnType<typeof getExchangeApiKeys> | null = null;

async function getApiKeys() {
  if (!apiKeysPromise) {
    apiKeysPromise = getExchangeApiKeys(SecretsKeys.CryptoApiKey);
  }
  return apiKeysPromise;
}

function signRequest<T extends Record<string, unknown>>(
  body: T,
  method: string,
  apiKey: string,
  secretKey: string
): Record<string, unknown> {
  const nonce = Date.now();
  const id = nonce;
  const paramsString = Object.keys(body)
    .sort()
    .map((key) => `${key}${String(body[key])}`)
    .join('');
  const sigPayload = `${method}${id}${apiKey}${paramsString}${nonce}`;
  const sig = crypto.createHmac('sha256', secretKey).update(sigPayload, 'ascii').digest('hex');
  return { id, method, api_key: apiKey, params: body, nonce, sig };
}

type CryptoApiResponse<TResult> = {
  code?: number;
  message?: string;
  result?: TResult;
};

/** Crypto.com wraps list payloads as result.data (see .NET ResponseWithResult). */
function unwrapResultData<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (result && typeof result === 'object' && 'data' in result) {
    const data = (result as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data as T[];
    }
  }
  return [];
}

async function postPrivate<TBody extends Record<string, unknown>, TResult>(
  method: string,
  params: TBody
): Promise<TResult> {
  const keys = await getApiKeys();
  const signed = signRequest(params, method, keys.apiKey, keys.secretKey);
  const response = await fetch(`${BASE_URL}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(signed),
  });
  const text = await response.text();
  if (text === 'Too Many Requests') {
    throw new Error('Too Many Requests');
  }
  if (!response.ok) {
    throw new Error(`POST ${method} failed: ${text}`);
  }
  const json = JSON.parse(text) as CryptoApiResponse<TResult>;
  if (json.code != null && json.code !== 0) {
    throw new Error(json.message ?? `crypto api error ${json.code}`);
  }
  return json.result as TResult;
}

async function getPublic<TResult>(path: string): Promise<TResult> {
  const response = await fetch(`${BASE_URL}/${path}`, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${text}`);
  }
  const json = JSON.parse(text) as CryptoApiResponse<TResult>;
  if (json.code != null && json.code !== 0) {
    throw new Error(json.message ?? `crypto api error ${json.code}`);
  }
  return json.result as TResult;
}

export async function getTickers(): Promise<Array<{ i: string; a: string; c: string }>> {
  const result = await getPublic<{ data: Array<{ i: string; a: string; c: string }> }>(
    'public/get-tickers'
  );
  return unwrapResultData(result);
}

export async function getInstruments(): Promise<
  Array<{
    symbol: string;
    quote_decimals: number;
    qty_tick_size: string;
  }>
> {
  const result = await getPublic<{
    data: Array<{
      symbol: string;
      quote_decimals: number;
      qty_tick_size: string;
    }>;
  }>('public/get-instruments');
  return unwrapResultData(result);
}

export type PositionBalance = {
  instrument_name: string;
  quantity: string;
  reserved_qty: string;
};

export async function getUserBalance(): Promise<{ data: Array<{ position_balances: PositionBalance[] }> }> {
  return postPrivate<Record<string, never>, { data: Array<{ position_balances: PositionBalance[] }> }>(
    'private/user-balance',
    {}
  );
}

export async function getOpenOrders(): Promise<{ data: Array<Record<string, unknown>> }> {
  const result = await postPrivate<
    Record<string, never>,
    { data: Array<Record<string, unknown>> }
  >('private/get-open-orders', {});
  return { data: unwrapResultData(result) };
}

export async function getOrderHistory(
  startTime: number,
  endTime: number
): Promise<{ data: Array<Record<string, unknown>> }> {
  const result = await postPrivate<
    { start_time: number; end_time: number },
    { data: Array<Record<string, unknown>> }
  >('private/get-order-history', { start_time: startTime, end_time: endTime });
  return { data: unwrapResultData(result) };
}

export async function createOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  return postPrivate<Record<string, unknown>, Record<string, unknown>>('private/create-order', params);
}

export async function cancelOrder(orderId: string, instrumentName: string): Promise<Record<string, unknown>> {
  return postPrivate<{ order_id: string; instrument_name: string }, Record<string, unknown>>(
    'private/cancel-order',
    { order_id: orderId, instrument_name: instrumentName }
  );
}
