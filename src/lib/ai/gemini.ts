/**
 * Gemini provider built on @google/genai.
 * Requires GEMINI_API_KEY.
 */
import { GoogleGenAI } from "@google/genai";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AIProvider, GenerateTextOptions } from "./provider";

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";

let cached: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!cached) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new AppError(
        "AI_ERROR",
        "GEMINI_API_KEY is not configured. Add it to your environment to enable AI features.",
      );
    }
    cached = new GoogleGenAI({ apiKey: key });
  }
  return cached;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  async generateText(prompt: string, options: GenerateTextOptions = {}): Promise<string> {
    const response = await client().models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        systemInstruction: options.system,
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxOutputTokens,
        responseMimeType: options.json ? "application/json" : undefined,
      },
    });
    const text = response.text;
    if (!text) throw new AppError("AI_ERROR", "AI returned an empty response.");
    return text;
  }

  async generateStructured<T>(prompt: string, _schemaName: string, options: GenerateTextOptions = {}): Promise<T> {
    const raw = await this.generateText(prompt, { ...options, json: true });
    return parseJsonLoose<T>(raw);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await client().models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
    });
    const values = response.embeddings?.[0]?.values;
    if (!values) throw new AppError("EMBEDDING_ERROR", "Embedding generation failed.");
    return values;
  }

  async *streamText(prompt: string, options: GenerateTextOptions = {}): AsyncIterable<string> {
    const stream = await client().models.generateContentStream({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        systemInstruction: options.system,
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxOutputTokens,
      },
    });
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }
}

/** Tolerant JSON parser: strips markdown fences, finds the outermost object. */
export function parseJsonLoose<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? (fenced[1] ?? "").trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new AppError("AI_ERROR", "AI response was not valid JSON.");
  }
}

export function getAIProvider(): AIProvider {
  logger.info("ai", `Using provider: gemini (${TEXT_MODEL})`);
  return new GeminiProvider();
}
