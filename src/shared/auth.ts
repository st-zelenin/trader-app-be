import { Request } from 'express';
import { decodeJwt } from 'jose';
import { AzureUser } from './models';

const TOKEN_START = 'Bearer ';

function decodeAuthorizationHeader(authorizationHeader: string | undefined): Record<string, unknown> {
  if (!authorizationHeader) {
    throw new Error('authorizationHeader missing');
  }
  if (!authorizationHeader.startsWith(TOKEN_START)) {
    throw new Error('bearer token is expected');
  }
  const token = authorizationHeader.substring(TOKEN_START.length);
  return decodeJwt(token) as Record<string, unknown>;
}

function getDecodedValue(dictionary: Record<string, unknown>, key: string): string {
  const value = dictionary[key];
  if (typeof value !== 'string' || !value) {
    throw new Error(`key '${key}' is missing`);
  }
  return value;
}

export function getAzureUser(req: Request): AzureUser {
  const dictionary = decodeAuthorizationHeader(req.headers.authorization);
  return {
    oid: getDecodedValue(dictionary, 'oid'),
    name: getDecodedValue(dictionary, 'name'),
  };
}

export function getUserId(req: Request): string {
  const dictionary = decodeAuthorizationHeader(req.headers.authorization);
  return getDecodedValue(dictionary, 'oid');
}

export function validateUser(req: Request): void {
  getUserId(req);
}
