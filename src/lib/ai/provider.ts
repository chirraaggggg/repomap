/**
 * AI provider abstraction. Implement this interface to add a provider.
 */
export interface GenerateTextOptions {
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
}

export interface AIProvider {
  readonly name: string;
  generateText(prompt: string, options?: GenerateTextOptions): Promise<string>;
  generateStructured<T>(prompt: string, schemaName: string, options?: GenerateTextOptions): Promise<T>;
  generateEmbedding(text: string): Promise<number[]>;
  streamText(
    prompt: string,
    options?: GenerateTextOptions,
  ): AsyncIterable<string>;
}
