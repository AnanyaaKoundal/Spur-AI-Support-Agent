import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../llm.service.js', () => ({
  generateTitle: vi.fn(),
  generateReply: vi.fn(),
}));

const { handleMessage } = await import('../chat.service.js');
const { prisma } = await import('../../config/database.js');
const { generateTitle, generateReply } = await import('../llm.service.js');

describe('handleMessage — title generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a title for new conversations and stores it', async () => {
    const mockConversation = { id: 'conv-1', title: 'New conversation', createdAt: new Date() };

    vi.mocked(prisma.conversation.create).mockResolvedValue(mockConversation);
    vi.mocked(prisma.conversation.update).mockResolvedValue({
      ...mockConversation,
      title: 'Return Policy',
    });
    vi.mocked(generateTitle).mockResolvedValue('Return Policy');
    vi.mocked(generateReply).mockResolvedValue('Here is our return policy...');
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    const result = await handleMessage('What is your return policy?');

    expect(generateTitle).toHaveBeenCalledWith('What is your return policy?');
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { title: 'Return Policy' },
    });
    expect(result.sessionId).toBe('conv-1');
  });

  it('does not generate title for existing conversations', async () => {
    const existingConv = { id: 'conv-existing', title: 'Old Title' };

    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(existingConv);
    vi.mocked(generateReply).mockResolvedValue('Thanks for your question...');
    vi.mocked(prisma.message.create).mockResolvedValue({} as any);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await handleMessage('Another question', 'conv-existing');

    expect(generateTitle).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('throws 404 for non-existent sessionId', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null);

    await expect(
      handleMessage('hello', 'non-existent-id'),
    ).rejects.toThrow(/Conversation not found/i);
  });
});
