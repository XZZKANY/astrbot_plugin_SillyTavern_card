import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  rootDir,
  webDir: path.join(rootDir, 'web'),
  host: process.env.TAVERN_WEB_HOST || '0.0.0.0',
  port: Number(process.env.TAVERN_WEB_PORT || 8088),
  dbPath: process.env.TAVERN_WEB_DB_PATH || path.join(rootDir, 'data', 'tavern.db'),
  syncToken: process.env.TAVERN_WEB_SYNC_TOKEN || '',
  timelineLimit: Number(process.env.TAVERN_WEB_TIMELINE_LIMIT || 50),
};
