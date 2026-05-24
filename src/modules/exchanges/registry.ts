import { ExchangeId } from '../../shared/models';
import * as binance from './binance/binance.module';
import * as bybit from './bybit/bybit.module';
import * as crypto from './crypto/crypto.module';
import * as gate from './gate/gate.module';

export type ExchangeHandlers = typeof binance;

export const exchangeRegistry: Record<ExchangeId, ExchangeHandlers> = {
  binance,
  bybit,
  crypto,
  gate,
};

export function getExchangeModule(id: string): ExchangeHandlers {
  if (!(id in exchangeRegistry)) {
    throw new Error(`Unknown exchange: ${id}`);
  }
  return exchangeRegistry[id as ExchangeId];
}
