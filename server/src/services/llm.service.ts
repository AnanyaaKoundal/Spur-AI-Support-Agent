import type { Message } from '@prisma/client';
import OpenAI from 'openai';

import { env } from '../config/env.js';
import { buildSupportPrompt } from './prompt.service.js';

const MAX_HISTORY = 20;
const MAX_TOKENS = 500;
const MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 15000;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    console.log('[LLM] Initializing OpenAI client');
    client = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }

  return client;
}

const TITLE_MODEL = 'gpt-4o-mini';

export async function generateTitle(userMessage: string): Promise<string> {
  console.log('[LLM] Generating conversation title...');

  if (!env.openaiApiKey) {
    return 'New conversation';
  }

  try {
    const startedAt = Date.now();

    const response = await getClient().chat.completions.create(
      {
        model: TITLE_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that generates concise conversation titles (2–5 words) summarizing the user\'s intent. Respond with ONLY the title, no quotes, no punctuation, no explanation.',
          },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 20,
        temperature: 0.3,
      },
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );

    const duration = Date.now() - startedAt;
    const title = response.choices[0]?.message?.content?.trim() || 'New conversation';

    console.log(`[LLM] Generated title: "${title}" (${duration}ms)`);

    return title;
  } catch (error) {
    console.error('[LLM] Title generation failed:', error);
    return 'New conversation';
  }
}

export async function generateReply(
  history: Message[],
  userMessage: string,
): Promise<string> {
  console.log('\n[LLM] =====================================');
  console.log('[LLM] New chat request received');
  console.log(`[LLM] User message length: ${userMessage.length}`);
  console.log(`[LLM] Total history messages: ${history.length}`);

  if (!env.openaiApiKey) {
    console.error('[LLM] OPENAI_API_KEY is missing');

    return 'I’m sorry, the support assistant is currently unavailable. Please try again later.';
  }

  try {
    const startedAt = Date.now();

    const [systemPrompt, recentHistory] = await Promise.all([
      buildSupportPrompt(),
      Promise.resolve(history.slice(-MAX_HISTORY)),
    ]);

    console.log(
      `[LLM] Using ${recentHistory.length} messages for context`,
    );

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt,
      },

      ...recentHistory.map((message) => ({
        role:
          message.role === 'agent'
            ? ('assistant' as const)
            : ('user' as const),
        content: message.content,
      })),

      {
        role: 'user',
        content: userMessage,
      },
    ];

    console.log('[LLM] Calling OpenAI...');
    console.log(`[LLM] Model: ${MODEL}`);
    console.log(`[LLM] Max Tokens: ${MAX_TOKENS}`);

    const response = await getClient().chat.completions.create(
      {
        model: MODEL,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
      },
      {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    const duration = Date.now() - startedAt;

    console.log(`[LLM] Response received in ${duration}ms`);

    const reply =
      response.choices[0]?.message?.content?.trim() ||
      "I'm sorry, I couldn't generate a response.";

    console.log(`[LLM] Reply length: ${reply.length} characters`);
    console.log('[LLM] Request completed successfully');
    console.log('[LLM] =====================================\n');

    return reply;
  } catch (error) {
    console.error('\n[LLM] =====================================');
    console.error('[LLM] Request failed');

    if (error instanceof OpenAI.APIError) {
      console.error(
        `[LLM] OpenAI API Error | Status: ${error.status} | Code: ${error.code}`,
      );

      if (error.status === 429) {
        return 'I’m currently experiencing high demand. Please try again in a moment.';
      }

      if (error.code === 'insufficient_quota') {
        return 'The support assistant is temporarily unavailable. Please try again later.';
      }

      return 'I’m sorry, something went wrong while processing your request. Please try again after some time.';
    }

    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' ||
        error.message.toLowerCase().includes('timeout'))
    ) {
      console.error('[LLM] Request timed out');

      return 'The request took too long to process. Please try again.';
    }

    console.error('[LLM] Unexpected error:', error);

    return 'I’m sorry, something went wrong. Please try again.';
  }
}