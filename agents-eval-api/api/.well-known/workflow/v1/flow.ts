import { createRequire } from "node:module";

console.log("[WF CONSUMER] flow.ts loaded", new Date().toISOString());

const require = createRequire(import.meta.url);

// Load the built handler that Vite build produces
const flowModule = require("../../../../dist/.well-known/workflow/v1/flow.cjs");

export default async function handler(req: Request): Promise<Response> {
  console.log("[WF CONSUMER HIT] flow.ts", new Date().toISOString(), req.method, req.url);
  return flowModule.default(req);
}
