import cron from 'node-cron';
import { logger } from '../utils/logger';
import * as tradingDb from '../infra/trading-db.service';
import { exchangeRegistry } from '../modules/exchanges/registry';
import { ExchangeId } from '../shared/models';

const EXCHANGES: ExchangeId[] = ['binance', 'bybit', 'crypto', 'gate'];
const CRON_SCHEDULE = '0 */15 * * * *';

export function startUpdateRecentHistoryJob(): void {
  logger.info(
    `UpdateRecentHistory: registering cron (${CRON_SCHEDULE}, exchanges: ${EXCHANGES.join(', ')})`
  );

  cron.schedule(CRON_SCHEDULE, () => {
    logger.info('UpdateRecentHistory: cron tick');
    void runJob();
  });

  logger.info('UpdateRecentHistory: cron registered, first run on next schedule boundary');
}

async function runJob(): Promise<void> {
  const startedAt = Date.now();
  let syncCount = 0;
  let errorCount = 0;

  logger.info('UpdateRecentHistory: job run started');

  try {
    const users = await tradingDb.getUsersAsync();
    logger.info(`UpdateRecentHistory: loaded ${users.length} user(s)`);

    for (const user of users) {
      for (const exchangeId of EXCHANGES) {
        const mod = exchangeRegistry[exchangeId];
        if (!mod.syncAllUserPairs) {
          logger.warn(`UpdateRecentHistory: no syncAllUserPairs for ${exchangeId}, skipping`);
          continue;
        }

        try {
          logger.info(`UpdateRecentHistory: syncing ${exchangeId} for user ${user.id}`);
          await mod.syncAllUserPairs(user.id);
          syncCount++;
          logger.info(`UpdateRecentHistory: synced ${exchangeId} for user ${user.id}`);
        } catch (error) {
          errorCount++;
          logger.error(
            `UpdateRecentHistory: sync failed exchange=${exchangeId} userId=${user.id}`,
            { error }
          );
        }
      }
    }

    logger.info(
      `UpdateRecentHistory: job run finished (${syncCount} ok, ${errorCount} failed, ${users.length} user(s), ${Date.now() - startedAt}ms)`
    );
  } catch (error) {
    logger.error(`UpdateRecentHistory: job run aborted after ${Date.now() - startedAt}ms`, {
      error,
    });
  }
}
