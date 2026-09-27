/**
 * AI provider abstraction. Implement this interface to add a provider.
 * Re-exports the concrete contracts so callers can import from one module.
 */
export type { AIProvider, GenerateTextOptions, ModelKind } from "./types";

import { getAIProvider as getGroqProvider } from "./groq";
import type { AIProvider } from "./types";

export function getAIProvider(): AIProvider {
  return getGroqProvider();
}
