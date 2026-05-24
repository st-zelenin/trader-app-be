# trader-app-be

Local Node/TypeScript backend replacing Azure Functions for spot trading (User + Binance, Bybit, Crypto.com, Gate.io).

## Prerequisites

- Node.js 18+
- Same Cosmos DB and Key Vault as the .NET Function apps
- **Either** Azure CLI logged in for Key Vault **or** local secrets in `.env` (see below)

### Azure authentication (pick one)

**Option A — Key Vault (matches .NET local dev)**

```bash
az login --scope https://vault.azure.net/.default
```

If you see `AADSTS700082` / refresh token expired, run the command above again.

**Option B — secrets in `.env` (no Key Vault for Cosmos)**

Add to `.env`:

```env
CosmosDbKey=<your-cosmos-primary-key>
```

`GetUser` and other Cosmos reads work without `az login`. Exchange endpoints still need Key Vault or `SECRET_BINANCE`, `SECRET_BYBIT_SPOT`, etc. (JSON like Key Vault values).

## Setup

```bash
cp .env.example .env
# Edit AzureKeyVaultEndpoint, CosmosDbEndpoint, CORS_ORIGINS
npm install
npm run dev
```

Server listens on `http://0.0.0.0:7070` by default.

## API routes

All routes require `Authorization: Bearer <MSAL JWT>` (claims decoded without signature validation, same as .NET).

| Prefix | Example |
|--------|---------|
| `/api/user` | `GET /api/user/GetUser` |
| `/api/binance` | `GET /api/binance/GetTickers` |
| `/api/bybit` | `GET /api/bybit/GetBalances` |
| `/api/crypto` | `POST /api/crypto/ImportHistory_HttpStart` |
| `/api/gate` | `GET /api/gate/GetHistory?pair=BTC_USDT` |

`GET /health` is unauthenticated.

## GUI configuration

Point `trader-app-gui` `API_BASE` to this server (see `src/environments/config.ts`). Use your LAN IP instead of `localhost` when the UI runs on another machine.

`API_HUB_URL` (spot-trading-hub) is unchanged.

## Exchange SDKs

- Binance: `@binance/spot`
- Bybit: `bybit-api`
- Gate.io: `gate-api`
- Crypto.com: signed REST (ported from .NET)
