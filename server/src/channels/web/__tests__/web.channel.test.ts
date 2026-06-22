import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

vi.mock('../../../services/chat.service.js', () => ({
  handleMessage: vi.fn(),
  getConversations: vi.fn(),
  getConversationMessages: vi.fn(),
}));

vi.mock('../../../config/env.js', () => ({
  env: {
    openaiApiKey: 'sk-test-key',
    frontendUrl: 'http://localhost:5173',
    port: 3001,
    databaseUrl: 'postgresql://test',
    nodeEnv: 'test',
  },
}));

const { handleMessage } = await import('../../../services/chat.service.js');
const { default: routes } = await import('../web.channel.js');
const { errorHandler } = await import('../../../middleware/errorHandler.js');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/chat', routes);
  app.use(errorHandler);
  return app;
}

describe('POST /chat/message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for empty message body', async () => {
    const app = createTestApp();

    const res = await request(app)
      .post('/chat/message')
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('returns 400 for missing message field', async () => {
    const app = createTestApp();

    const res = await request(app)
      .post('/chat/message')
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 200 and expected shape on valid request', async () => {
    vi.mocked(handleMessage).mockResolvedValue({
      reply: 'Here is our return policy...',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
    });

    const app = createTestApp();

    const res = await request(app)
      .post('/chat/message')
      .send({ message: 'What is your return policy?' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reply');
    expect(res.body).toHaveProperty('sessionId');
    expect(res.body.reply).toBe('Here is our return policy...');
    expect(handleMessage).toHaveBeenCalledWith(
      'What is your return policy?',
      undefined,
    );
  });

  it('passes sessionId to the service when provided', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    vi.mocked(handleMessage).mockResolvedValue({
      reply: 'Sure!',
      sessionId: uuid,
    });

    const app = createTestApp();

    await request(app)
      .post('/chat/message')
      .send({ message: 'hello', sessionId: uuid });

    expect(handleMessage).toHaveBeenCalledWith('hello', uuid);
  });

  it('blocks requests after rate limit is exceeded', async () => {
    const app = express();
    app.use(express.json());

    const testLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: true,
      message: { reply: null, sessionId: null, error: 'Rate limited' },
    });

    app.post('/test-limit', testLimiter, (_req, res) => {
      res.json({ ok: true });
    });

    await request(app).post('/test-limit').expect(200);
    await request(app).post('/test-limit').expect(200);
    const res = await request(app).post('/test-limit').expect(429);

    expect(res.body.error).toBe('Rate limited');
  });
});
