// Express app: middleware, routes under /api, JSON error handler
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import routes from './routes/index.js';
import { health } from './controllers/health.controller.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(compression()); // gzip JSON — the bill lists are sent whole and filtered in the browser
  app.use(express.json());
  app.get('/health', health); // uptime pings without the /api prefix
  app.use('/api', routes);
  app.use(errorHandler);
  return app;
}
