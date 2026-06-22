import { api } from './client';
import type { Conversation, Message } from '$lib/types';

type SendMessageResponse = {
  reply: string;
  sessionId: string;
};

type ConversationsResponse = {
  data: Conversation[];
};

type MessagesResponse = {
  data: {
    conversation: Conversation;
    messages: Message[];
  };
};

export const chatApi = {
  sendMessage: async (message: string, sessionId?: string) => {
    const result = await api.post<SendMessageResponse>('/chat/message', { message, sessionId });
    console.log(`[API] sendMessage → session: ${result.sessionId}, reply: ${result.reply.length} chars`);
    return result;
  },

  getConversations: () =>
    api.get<ConversationsResponse>('/chat/conversations'),

  getMessages: (conversationId: string) =>
    api.get<MessagesResponse>(`/chat/conversations/${conversationId}/messages`),
};
