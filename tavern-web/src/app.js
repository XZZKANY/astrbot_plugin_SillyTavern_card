import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { createHealthRouter } from './routes/health.js';
import { createInternalRouter } from './routes/internal.js';
import { createPublicRouter } from './routes/public.js';

export function createApp({ broker }) {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(createHealthRouter());
  app.use('/internal', createInternalRouter({ broker }));
  app.use('/api', createPublicRouter({ broker }));
  app.use(express.static(config.webDir));

  app.get('/room/:roomId', (_req, res) => {
    res.sendFile(path.join(config.webDir, 'room.html'));
  });

  app.get('/spectator/:roomId', (_req, res) => {
    res.sendFile(path.join(config.webDir, 'spectator.html'));
  });

  return app;
}
