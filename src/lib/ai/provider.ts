/**
 * Provider resolution — thin compatibility layer over the AI manager.
 * New code should import { getAI } from "./manager" (or use the `ai`
 * feature operations) so BYOK and fallback are handled uniformly.
 */
import { getAI } from "./manager";
import type { AIProvider, ProviderCredentials } from "./types";

export type { AIProvider, GenerateTextOptions, ModelKind, ProviderCredentials, ReasoningEffort } from "./types";
export { parseJsonLoose } from "./providers/groq";

/**
 * Returns the provider for a request.
 * @param credentials optional BYOK credentials; when omitted, RepoTutor-owned
 *                    providers are used (Groq with OpenRouter fallback).
 */
export function getAIProvider(credentials?: ProviderCredentials): AIProvider {
  return getAI(credentials);
}
