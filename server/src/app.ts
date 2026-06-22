import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import routes from './channels/web/web.channel.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors({ origin: env.frontendUrl, credentials: true, exposedHeaders: ['Retry-After'] }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/chat', routes);

app.use(errorHandler);

export default app;
