/**
 * Lightweight structured logger. Keeps noisy internals out of user-facing
 * responses while still producing useful server-side logs.
 */
const isVerbose = process.env.NODE_ENV !== "production" || process.env.DEBUG === "1";

function emit(level: "info" | "warn" | "error", context: string, message: string, meta?: unknown) {
  const line = `[${level}] ${new Date().toISOString()} ${context}: ${message}`;
  if (level === "error") console.error(line, meta ?? "");
  else if (level === "warn" || isVerbose) console.log(line, meta ?? "");
}

export const logger = {
  info: (context: string, message: string, meta?: unknown) => emit("info", context, message, meta),
  warn: (context: string, message: string, meta?: unknown) => emit("warn", context, message, meta),
  error: (context: string, message: string, meta?: unknown) => emit("error", context, message, meta),
};
