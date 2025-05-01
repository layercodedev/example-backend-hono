import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { CoreMessage, streamText } from "ai";
import { createFactory } from "hono/factory";
import { env } from "cloudflare:workers";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { verifySignature, streamResponse } from "@layercode/node-server-sdk";

export const factory = createFactory();
const sessionMessages = {} as Record<string, CoreMessage[]>;

const SYSTEM_PROMPT = `You are a helpful conversation assistant. You should respond to the user's message in a conversational manner. Your output will be spoken by a TTS model. You should respond in a way that is easy for the TTS model to speak and sound natural.`;
const WELCOME_MESSAGE = "Welcome to Layercode. How can I help you today?";

export const onRequestPost = factory.createHandlers(
  zValidator(
    "json",
    z.object({
      text: z.string(),
      type: z.string(),
      session_id: z.string(),
      turn_id: z.string(),
    })
  ),
  async (c) => {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return c.json({ error: "GOOGLE_GENERATIVE_AI_API_KEY is not set" }, 500);
    }

    const secret = env.LAYERCODE_WEBHOOK_SECRET;
    if (!secret) {
      return c.json({ error: "LAYERCODE_WEBHOOK_SECRET is not set" }, 500);
    }

    const rawBody = await c.req.text();
    const signature = c.req.header("layercode-signature") || "";
    const payload = JSON.stringify(rawBody);
    const isValid = verifySignature({ payload, signature, secret });
    if (!isValid) {
      console.error("Invalid signature", signature, secret, rawBody);
      return c.json({ error: "Invalid signature" }, 401);
    }

    const { text, type, session_id, turn_id } = c.req.valid("json");

    let messages = sessionMessages[session_id] || [];
    // Add user message
    messages.push({ role: "user", content: [{ type: "text", text }] });

    const requestBody = { text, type, session_id, turn_id };
    if (type === "session.start") {
      return streamResponse(requestBody, async ({ stream }) => {
        stream.tts(WELCOME_MESSAGE);
        messages.push({
          role: "assistant",
          content: [{ type: "text", text: WELCOME_MESSAGE }],
        });
        stream.end();
      });
    }

    const google = createGoogleGenerativeAI({
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    });

    return streamResponse(requestBody, async ({ stream }) => {
      const { textStream } = streamText({
        model: google("gemini-2.0-flash-001"),
        system: SYSTEM_PROMPT,
        messages,
        onFinish: async ({ response }) => {
          // After the response has been generated and streamed, finally save it to the message list for this session
          messages.push(...response.messages);
          console.log(
            "Current message history for session",
            session_id,
            JSON.stringify(messages, null, 2)
          );
          sessionMessages[session_id] = messages;
          stream.end(); // We must call stream.end() here to tell Layercode that the assistant's response has finished
        },
      });
      // At any time, you can also return json objects, which will be forwarded directly to the client. Use this to create dynamic UI that is synchnised with the voice response.
      stream.data({
        textToBeShown: "Hello, how can I help you today?",
      });
      // Here we return the textStream chunks as SSE messages to Layercode, to be spoken to the user
      await stream.ttsTextStream(textStream);
    });
  }
);
