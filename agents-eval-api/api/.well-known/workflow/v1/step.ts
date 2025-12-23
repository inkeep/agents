import { createRequire } from "node:module";

console.log("[WF CONSUMER] step.ts loaded", new Date().toISOString());

const require = createRequire(import.meta.url);

// Load the built handler that Vite build produces
const stepModule = require("../../../../dist/.well-known/workflow/v1/step.cjs");

export default async function handler(req: Request): Promise<Response> {
  console.log("[WF CONSUMER HIT] step.ts", new Date().toISOString(), req.method, req.url);
  return stepModule.default(req);
}
