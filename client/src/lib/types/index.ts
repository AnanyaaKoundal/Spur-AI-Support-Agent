export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}
