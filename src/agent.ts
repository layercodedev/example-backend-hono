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

    const decoder = new TextDecoder();
    let buffer = '';
    let assistantText = '';
    let doneTokenSeen = false;

    const handleLine = async (line: string) => {
      let s = line.trim();
      if (!s) return;
      // Strip SSE data prefix if present
      if (s.startsWith('data:')) s = s.slice(5).trim();
      if (!s) return;
      // Stop when the stream signals completion
      if (s === '[DONE]') {
        doneTokenSeen = true;
        return;
      }
      // Attempt to parse only JSON payloads
      try {
        const msg = JSON.parse(s);
        const chunk = typeof msg?.response === 'string' ? msg.response : '';
        if (chunk) {
          stream.tts(chunk);
          assistantText += chunk;
        }
      } catch {
        // ignore non-JSON or partial lines
      }
    };

    const reader = typeof llmResponseStream?.getReader === 'function' ? llmResponseStream.getReader() : null;

    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const l of lines) {
          await handleLine(l);
          if (doneTokenSeen) break;
        }
        if (doneTokenSeen) break;
      }
      if (buffer && !doneTokenSeen) {
        await handleLine(buffer);
      }
    } else if (llmResponseStream && typeof llmResponseStream[Symbol.asyncIterator] === 'function') {
      for await (const chunk of llmResponseStream as AsyncIterable<any>) {
        const piece = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
        buffer += piece;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const l of lines) {
          await handleLine(l);
          if (doneTokenSeen) break;
        }
        if (doneTokenSeen) break;
      }
      if (buffer && !doneTokenSeen) {
        await handleLine(buffer);
      }
    }

    if (assistantText) {
      messages.push({ role: 'assistant', content: assistantText });
    }
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
