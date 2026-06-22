import { describe, it, expect } from 'vitest';
import { chatMessageSchema } from '../chat.validator.js';

describe('chatMessageSchema', () => {
  it('rejects empty message', () => {
    const result = chatMessageSchema.safeParse({ message: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Message cannot be empty');
    }
  });

  it('rejects very long message (over 10000 chars)', () => {
    const long = 'a'.repeat(10001);
    const result = chatMessageSchema.safeParse({ message: long });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Message is too long');
    }
  });

  it('accepts message at exactly 10000 chars', () => {
    const boundary = 'a'.repeat(10000);
    const result = chatMessageSchema.safeParse({ message: boundary });
    expect(result.success).toBe(true);
  });

  it('accepts valid message without sessionId', () => {
    const result = chatMessageSchema.safeParse({ message: 'What is your return policy?' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe('What is your return policy?');
      expect(result.data.sessionId).toBeUndefined();
    }
  });

  it('rejects invalid sessionId format', () => {
    const result = chatMessageSchema.safeParse({
      message: 'hello',
      sessionId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid UUID sessionId', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = chatMessageSchema.safeParse({
      message: 'hello',
      sessionId: uuid,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionId).toBe(uuid);
    }
  });
});
