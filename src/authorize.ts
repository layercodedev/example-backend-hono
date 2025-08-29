import { Context } from 'hono';
import { env } from 'cloudflare:workers';

export const onRequestPost = async (c: Context) => {
  try {
    const response = await fetch('https://api.layercode.com/v1/agents/web/authorize_session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LAYERCODE_API_KEY}`,
      },
      body: JSON.stringify({ agent_id: 'your-agent-id', conversation_id: null }),
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
};
