import { Request } from 'express';
import * as cryptoDb from '../../../infra/crypto-db.service';
import * as cryptoClient from './crypto.client';
import { apiToCryptoDoc } from './crypto.mapper';

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_MS = 23 * HOUR_MS;

interface JobState {
  id: string;
  status: 'Running' | 'Completed' | 'Failed';
  runtimeStatus: string;
  output?: unknown;
  error?: string;
}

const jobs = new Map<string, JobState>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runImport(userId: string, periodMonths: number): Promise<void> {
  const now = Date.now();
  const totalMs = periodMonths * 30 * 24 * HOUR_MS;
  let end = now;
  const startLimit = now - totalMs;

  while (end > startLimit) {
    const start = Math.max(end - WINDOW_MS, startLimit);
    const response = await cryptoClient.getOrderHistory(start, end);
    const docs = (response.data ?? [])
      .filter((o) => o.status === 'FILLED')
      .map((o) => {
        const doc = apiToCryptoDoc(o);
        doc.id = doc.order_id;
        return doc;
      });
    if (docs.length) {
      await cryptoDb.upsertCryptoOrdersAsync(docs, userId);
    }
    end = start;
    await sleep(1000);
  }
}

export const importHistoryJobs = {
  start(userId: string, periodMonths: number, req: Request): { id: string; statusUrl: string } {
    const id = crypto.randomUUID();
    const host = req.get('host');
    const protocol = req.protocol;
    const statusUrl = `${protocol}://${host}/api/crypto/ImportHistory/status?instanceId=${id}`;
    jobs.set(id, { id, status: 'Running', runtimeStatus: 'Running' });

    void runImport(userId, periodMonths)
      .then(() => {
        jobs.set(id, { id, status: 'Completed', runtimeStatus: 'Completed' });
      })
      .catch((error) => {
        jobs.set(id, {
          id,
          status: 'Failed',
          runtimeStatus: 'Failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    return { id, statusUrl };
  },

  getStatus(id: string): JobState | undefined {
    return jobs.get(id);
  },
};
