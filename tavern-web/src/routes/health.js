import { Router } from 'express';

export function createHealthRouter() {
  const router = Router();
  router.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  return router;
}
