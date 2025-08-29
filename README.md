# Layercode Conversational AI Backend (Hono + Cloudflare Workers)

This open source project demonstrates how to build a real-time voice agent using [Layercode](https://layercode.com) Voice Agents, with a Hono backend to drive the agent's responses.

Read the companion guide: [Hono Backend Guide](https://docs.layercode.com/backend-guides/hono)

## Features

- **Browser or Phone Voice Interaction:** Users can speak to the agent directly from their browser or phone (see [Layercode docs](https://docs.layercode.com) for more details on connecting these channels)
- **Session State:** Conversation history is stored in memory. You can easily switch to a database or Redis to persist sessions.
- **LLM Integration:** User queries are sent to [Gemini Flash 2.0](https://ai.google.dev/gemini-api/docs/models/gemini).
- **Streaming Responses:** LLM responses are streamed back, where Layercode handles the conversion to speech and playback to the user.

## How It Works

1. **Frontend:**
   See the [Layercode docs](https://docs.layercode.com) for details about connecting a Web Voice Agent frontend or Phone channel to the agent. This backend can also be tested our in the [Layercode Dashboard](https://dash.layercode.com) Playground.

2. **Transcription & Webhook:**
   Layercode transcribes user speech. For each complete message, it sends a webhook containing the transcribed text to the /agent endpoint.

3. **Backend Processing:**
   The transcribed text is sent to the LLM (Gemini Flash 2.0) to generate a response.

4. **Streaming & Speech Synthesis:**
   As soon as the LLM starts generating a response, the backend streams the output back as SSE messags to Layercode, which converts it to speech and delivers it to the frontend for playback in realtime.

## Getting Started

> Requires **[Bun](https://bun.sh) 1.0+** and **Node.js 18+**

```bash
# Install dependencies
bun install
```

Add a `.dev.vars` file (or use `.dev.vars.example` as a template):

- `GOOGLE_GENERATIVE_AI_API_KEY` - Your Google AI API key
- `LAYERCODE_WEBHOOK_SECRET` - Your Layercode agent's webhook secret, found in the [Layercode dashboard](https://dash.layercode.com) (goto your agent, click Edit in the Your Backend Box and copy the webhook secret shown)
- `LAYERCODE_API_KEY` - Your Layercode API key found in the [Layercode dashboard settings](https://dash.layercode.com/settings)

If running locally, setup a tunnel (we recommend cloudflared which is free for dev) to your localhost so the Layercode webhook can reach your backend. Follow our tunneling guide here: [https://docs.layercode.com/tunnelling](https://docs.layercode.com/tunnelling)

If you didn't follow the tunneling guide, and are deploying this example to the internet, remember to set the Webhook URL in the [Layercode dashboard](https://dash.layercode.com/) (click Edit in the Your Backend box) to your publically accessible backend URL.

Now run the backend:

```bash
# Start local dev server (with live reload)
bun run dev

# Deploy to Cloudflare Workers
bun run deploy
```

The easiest way to talk to your agent is to use the [Layercode Dashboard](https://dash.layercode.com) Playground.

Tip: If you don't hear any response from your voice agent, check the Webhook Logs tab in your agent in the [Layercode Dashboard](https://dash.layercode.com/) to see the response from your backend.

## API

### POST `/agent`

Send the user's text and receive streamed chunks.

#### Request JSON

```jsonc
{
  "text": "Hello, how are you?",
  "type": "message", // "message" or "session.start"
  "session_id": "sess-1234",
  "turn_id": "turn-0001"
}
```

#### Streaming Response (SSE)

All streaming and SSE response handling is managed by [`@layercode/node-server-sdk`](https://www.npmjs.com/package/@layercode/node-server-sdk), which provides a simple interface for sending TTS and data chunks to the client, abstracting away manual SSE logic.

```ts
data: {"type":"response.tts","content":"Hi there!","turn_id":"turn-0001"}

data: {"type":"response.end","turn_id":"turn-0001"}
```

| Type           | Description                         |
| -------------- | ----------------------------------- |
| `response.tts` | A partial or complete chunk of text |
| `response.end` | Indicates the turn has finished     |

### POST `/authorize`

It receives the frontend's request then, calls the Layercode authorization API using your secret API key, and finally returns the `client_session_key` (and optionally a `conversation_id`) to the frontend. This key is required for the frontend to establish a secure WebSocket connection to Layercode.

## License

MIT
