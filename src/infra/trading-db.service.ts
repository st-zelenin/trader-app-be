import { Exchanges, AzureUser, CryptoPair, ExchangeSymbol, OrderedSymbols, Trader } from '../shared/models';
import { executeReadQuery, getContainer } from './cosmos-client';

const DB_NAME = 'trading';
const USERS_CONTAINER = 'users';

async function usersContainer() {
  return getContainer(DB_NAME, USERS_CONTAINER, '/id');
}

function getExchangePairs(exchange: string, user: Trader): CryptoPair[] {
  switch (exchange) {
    case Exchanges.GateIo:
      return user.gate;
    case Exchanges.CryptoCom:
      return user.crypto;
    case Exchanges.Coinbase:
      return user.coinbase;
    case Exchanges.ByBit:
      return user.bybit;
    case Exchanges.Binance:
      return user.binance;
    default:
      throw new Error(`unhandled exchange: ${exchange}`);
  }
}

function orderCryptoPairs(orderedSymbols: string[], originalPairs: CryptoPair[]): CryptoPair[] {
  return orderedSymbols.map((symbol) => {
    const pair = originalPairs.find((p) => p.symbol === symbol);
    if (!pair) {
      throw new Error(`symbol ${symbol} not found in user pairs`);
    }
    return pair;
  });
}

export async function getUserAsync(azureUserId: string): Promise<Trader> {
  const container = await usersContainer();
  const { resource } = await container.item(azureUserId, azureUserId).read<Trader>();
  if (!resource) {
    throw new Error(`user not found: ${azureUserId}`);
  }
  return resource;
}

export async function getOrCreateUserAsync(azureUser: AzureUser): Promise<Trader> {
  const container = await usersContainer();
  const existing = await executeReadQuery<Trader>(container, {
    query: 'SELECT * FROM c WHERE c.id = @id OFFSET 0 LIMIT 1',
    parameters: [{ name: '@id', value: azureUser.oid }],
  });
  if (existing.length > 0) {
    return existing[0];
  }

  const newUser: Trader = {
    id: azureUser.oid,
    name: azureUser.name,
    gate: [],
    crypto: [],
    coinbase: [],
    bybit: [],
    binance: [],
  };
  const { resource } = await container.items.create(newUser);
  if (!resource) {
    throw new Error('failed to create user');
  }
  return resource;
}

export async function getUsersAsync(): Promise<Trader[]> {
  const container = await usersContainer();
  return executeReadQuery<Trader>(container, 'SELECT * FROM c');
}

export async function updateUserAsync(user: Trader): Promise<Trader> {
  const container = await usersContainer();
  const { resource } = await container.item(user.id, user.id).replace(user);
  if (!resource) {
    throw new Error('failed to update user');
  }
  return resource;
}

async function addRemovePairAsync(
  azureUserId: string,
  exchangeSymbol: ExchangeSymbol,
  add: boolean
): Promise<Trader> {
  const user = await getUserAsync(azureUserId);
  const pairs = getExchangePairs(exchangeSymbol.exchange, user);
  const pair = pairs.find((p) => p.symbol === exchangeSymbol.symbol);

  if (add) {
    if (pair) {
      throw new Error(`the pair ${exchangeSymbol.symbol} was already added`);
    }
    pairs.push({ symbol: exchangeSymbol.symbol, isArchived: false });
  } else {
    if (!pair) {
      throw new Error(`the pair ${exchangeSymbol.symbol} was already removed`);
    }
    pairs.splice(pairs.indexOf(pair), 1);
  }

  return updateUserAsync(user);
}

export function addPairAsync(azureUserId: string, exchangeSymbol: ExchangeSymbol): Promise<Trader> {
  return addRemovePairAsync(azureUserId, exchangeSymbol, true);
}

export function removePairAsync(azureUserId: string, exchangeSymbol: ExchangeSymbol): Promise<Trader> {
  return addRemovePairAsync(azureUserId, exchangeSymbol, false);
}

export async function orderPairsAsync(azureUserId: string, orderedSymbols: OrderedSymbols): Promise<Trader> {
  const user = await getUserAsync(azureUserId);
  const pairs = getExchangePairs(orderedSymbols.exchange, user);
  if (pairs.length !== orderedSymbols.symbols.length) {
    throw new Error(
      `original and ordered pairs count is not the same: ${pairs.length} != ${orderedSymbols.symbols.length}`
    );
  }

  const ordered = orderCryptoPairs(orderedSymbols.symbols, pairs);
  switch (orderedSymbols.exchange) {
    case Exchanges.GateIo:
      user.gate = ordered;
      break;
    case Exchanges.CryptoCom:
      user.crypto = ordered;
      break;
    case Exchanges.Coinbase:
      user.coinbase = ordered;
      break;
    case Exchanges.ByBit:
      user.bybit = ordered;
      break;
    case Exchanges.Binance:
      user.binance = ordered;
      break;
    default:
      throw new Error(`unhandled exchange: ${orderedSymbols.exchange}`);
  }

  return updateUserAsync(user);
}

export async function togglePairArchiveAsync(
  azureUserId: string,
  exchangeSymbol: ExchangeSymbol
): Promise<Trader> {
  const user = await getUserAsync(azureUserId);
  const pairs = getExchangePairs(exchangeSymbol.exchange, user);
  const pair = pairs.find((p) => p.symbol === exchangeSymbol.symbol);
  if (!pair) {
    throw new Error(`pair ${exchangeSymbol.symbol} not found`);
  }
  pair.isArchived = !pair.isArchived;
  return updateUserAsync(user);
}

export async function doSomeTechService(azureUserId: string): Promise<void> {
  const container = await usersContainer();
  await executeReadQuery<Trader>(container, {
    query: 'SELECT * FROM c WHERE c.id = @id',
    parameters: [{ name: '@id', value: azureUserId }],
  });
}

export function getActivePairSymbols(user: Trader, exchangeId: 'binance' | 'bybit' | 'crypto' | 'gate'): string[] {
  const pairs =
    exchangeId === 'binance'
      ? user.binance
      : exchangeId === 'bybit'
        ? user.bybit
        : exchangeId === 'crypto'
          ? user.crypto
          : user.gate;
  return pairs.filter((p) => !p.isArchived).map((p) => p.symbol);
}
