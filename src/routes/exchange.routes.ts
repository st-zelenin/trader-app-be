import { Router, Request, Response } from 'express';
import { getUserId } from '../shared/auth';
import { asyncHandler } from '../shared/middleware/auth.middleware';
import { getExchangeModule } from '../modules/exchanges/registry';
import * as cryptoModule from '../modules/exchanges/crypto/crypto.module';

function withUser(
  handler: (req: Request, res: Response, userId: string) => Promise<void>
): (req: Request, res: Response) => Promise<void> {
  return async (req, res) => {
    const userId = getUserId(req);
    await handler(req, res, userId);
  };
}

function withUserOptional(
  handler: (req: Request, res: Response, userId?: string) => Promise<void>
): (req: Request, res: Response) => Promise<void> {
  return async (req, res) => {
    let userId: string | undefined;
    try {
      userId = getUserId(req);
    } catch {
      userId = undefined;
    }
    await handler(req, res, userId);
  };
}

export function createExchangeRouter(exchangeId: string): Router {
  const router = Router();
  const mod = getExchangeModule(exchangeId);

  router.get('/GetTickers', asyncHandler(withUser(mod.getTickers)));
  router.get('/GetBalances', asyncHandler((req, res) => mod.getBalances(req, res)));
  router.get('/GetAverages', asyncHandler(withUser(mod.getAverages)));
  router.get('/GetOpenOrders', asyncHandler((req, res) => mod.getOpenOrders(req, res)));
  router.get('/GetProducts', asyncHandler(withUser(mod.getProducts)));
  router.get('/GetCurrencyPairs', asyncHandler(withUser(mod.getCurrencyPairs)));
  router.get('/GetHistory', asyncHandler(withUser(mod.getHistory)));
  router.get('/GetRecentTradeHistory', asyncHandler(withUser(mod.getRecentTradeHistory)));
  router.get('/GetRecentBuyAverages', asyncHandler(withUser(mod.getRecentBuyAverages)));
  router.post('/CreateOrder', asyncHandler((req, res) => mod.createOrder(req, res)));
  router.post('/CancelOrder', asyncHandler((req, res) => mod.cancelOrder(req, res)));
  router.post('/AddDexOrder', asyncHandler(withUser(mod.addDexOrder)));
  router.get('/UpdateRecentHistory', asyncHandler(withUser(mod.updateRecentHistory)));
  router.all('/ImportHistory', asyncHandler(withUser(mod.importHistory)));
  router.all('/DoSomeTechService', asyncHandler(withUser(mod.doSomeTechService)));

  if (exchangeId === 'crypto') {
    router.post(
      '/ImportHistory_HttpStart',
      asyncHandler(withUser(cryptoModule.importHistoryHttpStart))
    );
    router.get('/ImportHistory/status', asyncHandler(cryptoModule.importHistoryStatus));
  }

  return router;
}
