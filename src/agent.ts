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
  // return streamResponse(json, async ({ stream }) => {
  //   const { textStream } = streamText({
  //     model: google('gemini-2.0-flash-001'),
  //     system: SYSTEM_PROMPT,
  //     messages,
  //     onFinish: async ({ response }) => {
  //       // After the response has been generated and streamed, finally save it to the message list for this session
  //       messages.push(...response.messages);
  //       console.log('Current message history for session', session_id, JSON.stringify(messages, null, 2));
  //       sessionMessages[session_id] = messages;
  //       stream.end(); // We must call stream.end() here to tell Layercode that the assistant's response has finished
  //     },
  //   });
  //   // At any time, you can also return json objects, which will be forwarded directly to the client. Use this to create dynamic UI that is synchnised with the voice response.
  //   stream.data({
  //     textToBeShown: 'Hello, how can I help you today?',
  //   });
  //   // Here we return the textStream chunks as SSE messages to Layercode, to be spoken to the user
  //   await stream.ttsTextStream(textStream);
  // });
};
