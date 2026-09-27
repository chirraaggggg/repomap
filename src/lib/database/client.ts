/**
 * Supabase client factory.
 * - Browser: anon key client (RLS applies).
 * - Server: service-role client for trusted server-side persistence.
 * Falls back gracefully when env vars are missing so the app still runs.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

export function isDatabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

/** Server-side service-role client. Returns null when not configured. */
export function getServerSupabase(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) return null;
  if (!serverClient) {
    serverClient = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serverClient;
}

/** Browser anon client for auth (login UI). Returns null when not configured. */
export function getBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}
