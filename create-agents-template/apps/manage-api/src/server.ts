// server.ts
import app from "./index.js";
import { serve } from "@hono/node-server";

serve({
	fetch: app.fetch,
	port: 3002,
});
