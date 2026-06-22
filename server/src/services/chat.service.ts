import { prisma } from '../config/database.js';
import { generateReply, generateTitle } from './llm.service.js';
import { AppError } from '../middleware/errorHandler.js';

export async function handleMessage(message: string, sessionId?: string) {
  // Step 1: Find or create conversation
  let conversation;
  let isNew = false;

  if (sessionId) {
    conversation = await prisma.conversation.findUnique({
      where: { id: sessionId },
    });
    if (!conversation) {
      throw new AppError(404, 'Conversation not found');
    }
    console.log(`[Chat] Existing conversation ${sessionId}`);
  } else {
    conversation = await prisma.conversation.create({
      data: { title: 'New conversation' },
    });
    isNew = true;
    console.log(`[Chat] Created conversation ${conversation.id}`);
  }

  // Step 2: Save user message
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: message,
    },
  });
  console.log(`[Chat] Saved user message (${message.length} chars) in ${conversation.id}`);

  // Step 3: Generate conversation title from first message
  if (isNew) {
    const title = await generateTitle(message);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { title },
    });
  }

  // Step 4: Fetch history for context
  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { timestamp: 'asc' },
  });

  // Step 5: Generate AI reply (always returns a string, never throws)
  const reply = await generateReply(history, message);

  // Step 6: Save AI reply
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'agent',
      content: reply,
    },
  });
  console.log(`[Chat] Saved AI reply (${reply.length} chars) in ${conversation.id}`);

  return { reply, sessionId: conversation.id };
}

export async function getConversations() {
  return prisma.conversation.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, createdAt: true },
    take: 50,
  });
}

export async function getConversationMessages(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) {
    throw new AppError(404, 'Conversation not found');
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { timestamp: 'asc' },
    select: { id: true, conversationId: true, role: true, content: true, timestamp: true },
    take: 100,
  });

  return { conversation, messages };
}
