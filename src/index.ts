import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import { env } from './config/env';
import { logger } from './utils/logger';
import apiRouter from './routes';
import { startUpdateRecentHistoryJob } from './jobs/update-recent-history.job';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', apiRouter);

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(`trader-app-be listening on http://${env.HOST}:${env.PORT}`);
  startUpdateRecentHistoryJob();
});

process.on('SIGTERM', () => {
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default app;
