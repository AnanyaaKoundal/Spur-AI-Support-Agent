import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { chatMessageSchema } from '../../validators/chat.validator.js';
import { handleMessage, getConversations, getConversationMessages } from '../../services/chat.service.js';

const messageLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: true,
  message: { reply: null, sessionId: null, error: 'Please wait a moment before sending another message.' },
});

const router = Router();

router.get('/conversations', async (req, res, next) => {
  console.log(`[Web] GET /conversations | IP: ${req.ip}`);
  try {
    const data = await getConversations();
    console.log(`[Web] GET /conversations → ${data.length} conversations`);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get('/conversations/:id/messages', async (req, res, next) => {
  console.log(`[Web] GET /conversations/${req.params.id}/messages`);
  try {
    const result = await getConversationMessages(req.params.id);
    console.log(`[Web] GET /conversations/${req.params.id}/messages → ${result.messages.length} messages`);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/message', messageLimiter, async (req, res, next) => {
  try {
    const { message, sessionId } = chatMessageSchema.parse(req.body);
    console.log(`[Web] POST /message | session: ${sessionId ?? 'new'} | message: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}`);
    const result = await handleMessage(message, sessionId);
    console.log(`[Web] POST /message → session: ${result.sessionId}`);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
