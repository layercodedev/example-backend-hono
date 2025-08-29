import { Hono } from 'hono';
import { app as agentApp } from './agent';
import { app as authorizeApp } from './authorize';
import { cors } from 'hono/cors'

const app = new Hono();

app.route('/agent', agentApp);

app.use('/authorize', cors())
app.route('/authorize', authorizeApp);


export default app;
