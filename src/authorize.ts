import { Hono } from 'hono';
import { env } from 'cloudflare:workers';

const app = new Hono();

app.post('/', async (c) => {
  try {
    const response = await fetch("https://api.layercode.com/v1/pipelines/authorize_session", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LAYERCODE_API_KEY}`,
      },
      body: JSON.stringify({ pipeline_id: "your-pipeline-id", session_id: null }),
    });
    if (!response.ok) {
      console.log('response not ok', response.statusText);
      return c.json({ error: response.statusText });
    }
    const data: { client_session_key: string } = await response.json();
    return c.json(data);
  } catch (error) {
    return c.json({ error: error });
  }
});

export { app }
