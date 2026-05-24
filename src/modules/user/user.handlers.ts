import { Request, Response } from 'express';
import { getAzureUser, getUserId } from '../../shared/auth';
import { ExchangeSymbol, OrderedSymbols, Trader } from '../../shared/models';
import * as tradingDb from '../../infra/trading-db.service';

export async function getUser(req: Request, res: Response): Promise<void> {
  const azureUser = getAzureUser(req);
  const user = await tradingDb.getOrCreateUserAsync(azureUser);
  res.json(user);
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  getUserId(req);
  const user = req.body as Trader;
  const updated = await tradingDb.updateUserAsync(user);
  res.json(updated);
}

export async function addPair(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  const body = req.body as ExchangeSymbol;
  const user = await tradingDb.addPairAsync(userId, body);
  res.json(user);
}

export async function removePair(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  const body = req.body as ExchangeSymbol;
  const user = await tradingDb.removePairAsync(userId, body);
  res.json(user);
}

export async function orderPairs(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  const body = req.body as OrderedSymbols;
  const user = await tradingDb.orderPairsAsync(userId, body);
  res.json(user);
}

export async function togglePairArchive(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  const body = req.body as ExchangeSymbol;
  const user = await tradingDb.togglePairArchiveAsync(userId, body);
  res.json(user);
}

export async function doSomeTechService(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  await tradingDb.doSomeTechService(userId);
  res.status(200).send();
}
