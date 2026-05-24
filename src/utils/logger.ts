import winston from 'winston';
import { env } from '../config/env';

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
      const base = `${timestamp} [${level}] ${message}`;
      return stack ? `${base}\n${stack}` : base;
    })
  ),
  transports: [new winston.transports.Console()],
});
