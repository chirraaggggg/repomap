/**
 * Token estimation. Char-heuristic based (~3.6 chars/token for code),
 * avoids a tokenizer dependency while staying within ~15% of real counts.
 */
export const MAX_ANALYSIS_TOKENS = 30_000;
export const MAX_CHAT_CONTEXT_TOKENS = 12_000;
export const MAX_MASTER_PROMPT_TOKENS = 20_000;

const CHARS_PER_TOKEN = 3.6;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateFileTokens(content: string): number {
  return estimateTokens(content);
}

/** Grows/shrinks a budget to fit `available` tokens, returns largest prefix count that fits. */
export function fitWithinBudget<T>(
  items: T[],
  tokenOf: (item: T) => number,
  budget: number,
): { selected: T[]; tokens: number; overflow: boolean } {
  const selected: T[] = [];
  let tokens = 0;
  for (const item of items) {
    const t = tokenOf(item);
    if (tokens + t > budget) {
      return { selected, tokens, overflow: true };
    }
    tokens += t;
    selected.push(item);
  }
  return { selected, tokens, overflow: false };
}
