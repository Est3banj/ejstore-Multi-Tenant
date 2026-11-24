const express = require('express');
const { errorEnvelope } = require('./errors');
const { corsMiddleware, errorMiddleware, verifyBearer } = require('./middleware');
const { FN_REGISTRY, EXCLUDED_ROUTES } = require('./registry');

function createApp(registry = FN_REGISTRY, overrides = {}) {
  const verify = overrides.verifyBearer || verifyBearer;
  const app = express();
  app.disable('x-powered-by');

  app.use('/api/:fn', (req, res, next) => {
    // Include CORS, auth and JSON errors, not just successful secret delivery.
    if (req.params.fn === 'getPurchaseCredentials') {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    next();
  });
  app.use(corsMiddleware);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/api/:fn', async (req, res, next) => {
    try {
      const { fn } = req.params;

      if (EXCLUDED_ROUTES[fn]) {
        res.status(404).json(errorEnvelope('not-found', EXCLUDED_ROUTES[fn]));
        return;
      }

      const def = registry[fn];
      if (!def) {
        res.status(404).json(errorEnvelope('not-found', 'Función no encontrada'));
        return;
      }

      let context = { auth: null };
      if (def.auth === 'bearer') {
        context = { auth: await verify(req) };
      } else if (req.headers.authorization) {
        try {
          context = { auth: await verify(req) };
        } catch {
          // auth 'none': token presente pero inválido/expirado — paridad con callable público
        }
      }

      if (def.raw) {
        await def.handler(req, res);
        return;
      }

      const body = req.body ?? {};
      const data = body.data ?? null;
      const result = await def.handler(data, context);
      if (!res.writableEnded) {
        res.status(200).json({ result });
      }
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json(errorEnvelope('not-found', 'Función no encontrada'));
    } else {
      res.status(404).json(errorEnvelope('not-found', 'Not Found'));
    }
  });

  app.use(errorMiddleware);

  return app;
}

module.exports = { createApp };
