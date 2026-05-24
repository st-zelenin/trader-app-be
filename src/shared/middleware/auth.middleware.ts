import { NextFunction, Request, Response } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'authorizationHeader missing' });
      return;
    }
    next();
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
  }
}

function statusForError(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('authorizationHeader') || message.includes('bearer token')) {
    return 401;
  }
  if (
    message.includes('Key Vault') ||
    message.includes('ChainedTokenCredential') ||
    message.includes('CredentialUnavailable')
  ) {
    return 503;
  }
  return 400;
}

export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(statusForError(error)).json({ error: message });
    });
  };
}
