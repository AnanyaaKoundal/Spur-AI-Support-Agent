import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from '@prisma/client';

const mockCreate = vi.fn();

vi.mock('openai', () => {
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  }

  return {
    default: class MockOpenAI {
      static APIError = MockAPIError;
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

vi.mock('../../config/env.js', () => ({
  env: {
    openaiApiKey: 'sk-test-key',
    port: 3001,
    databaseUrl: 'postgresql://test',
    frontendUrl: 'http://localhost:5173',
    nodeEnv: 'test',
  },
}));

vi.mock('../prompt.service.js', () => ({
  buildSupportPrompt: () => Promise.resolve('You are a support agent.'),
}));

const { generateTitle, generateReply } = await import('../llm.service.js');

const emptyHistory: Message[] = [];

describe('generateReply — error mapping', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns friendly message on 401', async () => {
    const { default: OpenAI } = await import('openai');
    const error = new (OpenAI as any).APIError(401, 'invalid_api_key');
    mockCreate.mockRejectedValue(error);

    const result = await generateReply(emptyHistory, 'test');

    expect(result).toContain('something went wrong while processing your request');
  });

  it('returns friendly message on 429 (rate limited)', async () => {
    const { default: OpenAI } = await import('openai');
    const error = new (OpenAI as any).APIError(429, 'rate_limited');
    mockCreate.mockRejectedValue(error);

    const result = await generateReply(emptyHistory, 'test');

    expect(result).toContain('currently experiencing high demand');
  });

  it('returns friendly message on timeout', async () => {
    const timeoutError = new Error('timeout');
    timeoutError.name = 'TimeoutError';
    mockCreate.mockRejectedValue(timeoutError);

    const result = await generateReply(emptyHistory, 'test');

    expect(result).toContain('took too long to process');
  });

  it('returns friendly message for unexpected errors', async () => {
    mockCreate.mockRejectedValue(new Error('network failure'));

    const result = await generateReply(emptyHistory, 'test');

    expect(result).toContain('something went wrong');
  });
});

describe('generateTitle', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns a generated title from the AI response', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Return Policy',
          },
        },
      ],
    });

    const title = await generateTitle('What is your return policy?');

    expect(title).toBe('Return Policy');
  });

  it('falls back when AI returns empty content', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: '',
          },
        },
      ],
    });

    const title = await generateTitle('What is your return policy?');

    expect(title).toBe('New conversation');
  });
});
