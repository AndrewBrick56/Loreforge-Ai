import "server-only";
import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Lazily constructs the OpenAI client on first use. This matters more than
 * it looks: the SDK's constructor throws immediately if there's no API key,
 * and Next.js evaluates route modules at build time to collect metadata —
 * so a module-level `new OpenAI()` breaks `next build` entirely whenever
 * OPENAI_API_KEY isn't set, even for routes that are never called. Building
 * the client only when a request actually needs it avoids that.
 */
export function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}
