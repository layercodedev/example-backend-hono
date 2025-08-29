import { env } from 'cloudflare:workers';
import { verifySignature, streamResponse } from '@layercode/node-server-sdk';
import { Context } from 'hono';

const conversations = {} as Record<string, Array<{ role: 'user' | 'assistant'; content: string }>>;

const SYSTEM_PROMPT = `You are a helpful conversation assistant. You should respond to the user's message in a conversational manner. Your output will be spoken by a TTS model. You should respond in a way that is easy for the TTS model to speak and sound natural.`;
const WELCOME_MESSAGE = 'Welcome to Layercode. How can I help you today?';

export const onRequestPost = async (c: Context) => {
  const secret = env.LAYERCODE_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: 'LAYERCODE_WEBHOOK_SECRET is not set' }, 500);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header('layercode-signature') || '';
  const isValid = verifySignature({ payload: rawBody, signature, secret });
  if (!isValid) {
    console.error('Invalid signature', signature, secret, rawBody);
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const json = await c.req.json();
  const { text, type, conversation_id, turn_id } = json;
  let messages = conversations[conversation_id] || [];
  // Add user message
  messages.push({ role: 'user', content: text });

  if (type === 'session.start') {
    return streamResponse(json, async ({ stream }) => {
      stream.tts(WELCOME_MESSAGE);
      messages.push({
        role: 'assistant',
        content: WELCOME_MESSAGE,
      });
      conversations[conversation_id] = messages;
      stream.end();
    });
  }
  return streamResponse(json, async ({ stream }) => {
    const llmResponseStream: any = await env.AI.run('@cf/google/gemma-3-12b-it', {
      messages,
      stream: true,
    });
    const assistantText = await stream.ttsWorkersAIStream(llmResponseStream);
    if (assistantText) messages.push({ role: 'assistant', content: assistantText });
    conversations[conversation_id] = messages;
    stream.end();
  });
};
