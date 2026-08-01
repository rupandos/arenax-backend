import pino from 'pino';
import { config } from '../config/env';

export const logger = pino({
  level: config.logLevel,
  base: { service: 'arenax-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.isTest && { enabled: false }),
});
