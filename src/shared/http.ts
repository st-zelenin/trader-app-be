import { Request } from 'express';

export function getRequiredQueryParam(req: Request, name: string): string {
  const value = req.query[name];
  if (typeof value !== 'string' || !value) {
    throw new Error(`query parameter '${name}' is required`);
  }
  return value;
}

export function getOptionalQueryParam(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === 'string' ? value : undefined;
}

export function getQueryInt(req: Request, name: string, defaultValue: number): number {
  const raw = req.query[name];
  if (typeof raw !== 'string') {
    return defaultValue;
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}
