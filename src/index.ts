import { Hono } from 'hono';
import { onRequestPost as onRequestPostAgent } from './agent';
import { onRequestPost as onRequestPostAuthorize } from './authorize';
import { cors } from 'hono/cors';

type Bindings = {
  AI: Ai;
};

const app = new Hono<{ Bindings: Bindings }>();

app.post('/agent', onRequestPostAgent);

app.use('/authorize', cors());
app.post('/authorize', onRequestPostAuthorize);

export default app;
