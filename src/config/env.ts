import { bool, cleanEnv, port, str } from 'envalid';

export const env = cleanEnv(process.env, {
  HOST: str({ default: '0.0.0.0' }),
  PORT: port({ default: 7070 }),
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  LOG_LEVEL: str({
    choices: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'],
    default: 'info',
  }),
  AzureKeyVaultEndpoint: str(),
  CosmosDbEndpoint: str(),
  /** When set, Cosmos uses this key instead of Key Vault (local dev). */
  CosmosDbKey: str({ default: '' }),
  /** When true, skip Key Vault and read secrets from SECRET_* env vars only. */
  UseLocalSecrets: bool({ default: false }),
  CORS_ORIGINS: str({ default: 'http://localhost:4201' }),
});
