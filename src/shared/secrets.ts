import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { env } from '../config/env';
import { ExchangeApiKeysSecret } from './models';

export const SecretsKeys = {
  CosmosClient: 'COSMOS-CLIENT-KEY',
  CryptoApiKey: 'CRYPTO-SPOT-TRADE',
  ByBitApiKey: 'BYBIT-SPOT',
  GateApiKey: 'GATE-SPOT-WRITE',
  BinanceApiKey: 'BINANCE',
} as const;

const cache = new Map<string, string>();

function secretEnvVarName(vaultSecretName: string): string {
  return `SECRET_${vaultSecretName.replace(/-/g, '_')}`;
}

function getLocalSecret(vaultSecretName: string): string | undefined {
  if (vaultSecretName === SecretsKeys.CosmosClient && env.CosmosDbKey) {
    return env.CosmosDbKey;
  }
  return process.env[secretEnvVarName(vaultSecretName)];
}

let keyVaultClient: SecretClient | null = null;

function getKeyVaultClient(): SecretClient {
  if (!keyVaultClient) {
    keyVaultClient = new SecretClient(env.AzureKeyVaultEndpoint, new DefaultAzureCredential());
  }
  return keyVaultClient;
}

export async function getSecretAsync(key: string): Promise<string> {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const local = getLocalSecret(key);
  if (local) {
    cache.set(key, local);
    return local;
  }

  if (env.UseLocalSecrets) {
    throw new Error(
      `Missing local secret for ${key}. Set ${secretEnvVarName(key)} or CosmosDbKey in .env`
    );
  }

  try {
    const secret = await getKeyVaultClient().getSecret(key);
    const value = secret.value;
    if (!value) {
      throw new Error(`Secret ${key} has no value`);
    }
    cache.set(key, value);
    return value;
  } catch (error) {
    const hint =
      'Azure Key Vault auth failed. Run: az login --scope https://vault.azure.net/.default ' +
      'Or set CosmosDbKey / SECRET_* in .env (see .env.example).';
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${hint}\n${detail}`);
  }
}

export async function getSecretJsonAsync<T>(key: string): Promise<T> {
  const raw = await getSecretAsync(key);
  return JSON.parse(raw) as T;
}

function pickSecretString(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'object') {
      throw new Error(`Exchange API keys: "${key}" must be a string, not an object`);
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function normalizeExchangeApiKeys(raw: Record<string, unknown>): ExchangeApiKeysSecret {
  const apiKey = pickSecretString(raw, 'apiKey', 'ApiKey', 'key');
  const secretKey = pickSecretString(raw, 'secretKey', 'SecretKey', 'secret');
  if (!apiKey || !secretKey) {
    throw new Error(
      'Exchange API keys JSON must include apiKey and secretKey (or ApiKey/SecretKey)'
    );
  }
  return { apiKey, secretKey };
}

export async function getExchangeApiKeys(secretKey: string): Promise<ExchangeApiKeysSecret> {
  const raw = await getSecretJsonAsync<Record<string, unknown>>(secretKey);
  return normalizeExchangeApiKeys(raw);
}
