import Fastify from 'fastify';
import { registerAuthDecorator } from './plugins/auth.js';
import authRoute from './routes/auth.js';
import healthRoute from './routes/health.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  registerAuthDecorator(app);

  app.register(healthRoute);
  app.register(authRoute);

  return app;
}
