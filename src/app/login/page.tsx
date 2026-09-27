"use client";

import { useState } from "react";
import Link from "next/link";
import { GitFork, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  // Auth is optional; the toggle keeps the page consistent with the site theme.
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState<"github" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getSupabase = async () => {
    const { getBrowserSupabase } = await import("@/lib/database/client");
    return getBrowserSupabase();
  };

  const signInWithGitHub = async () => {
    setLoading("github");
    setError(null);
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        setError("Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: window.location.origin },
      });
      if (error) setError(error.message);
    } finally {
      setLoading(null);
    }
  };

  const signInWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("email");
    setError(null);
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        setError("Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) setError(error.message);
      else setSent(true);
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <Link href="/" className="mb-8 flex items-center gap-2 font-mono text-sm font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-accent text-xs font-bold text-white">R</span>
        repomap
      </Link>

      <h1 className="flex items-center justify-between text-2xl font-semibold">
        Sign in
        <ThemeToggle />
      </h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Optional — public repository analysis works without an account. Signing in enables saved history across devices.
      </p>

      <div className="mt-8 space-y-3">
        <Button variant="outline" size="lg" className="w-full" onClick={() => void signInWithGitHub()} disabled={loading !== null}>
          {loading === "github" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitFork className="h-4 w-4" />}
          Continue with GitHub
        </Button>

        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          or
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {sent ? (
          <p className="rounded-md border border-[var(--success)]/30 bg-[var(--success)]/10 p-3 text-sm text-[var(--success)]">
            Check your inbox — we sent a magic link to {email}.
          </p>
        ) : (
          <form onSubmit={signInWithEmail} className="space-y-3">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
            />
            <Button type="submit" variant="accent" size="lg" className="w-full" disabled={loading !== null}>
              {loading === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send magic link
            </Button>
          </form>
        )}

        {error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      <p className="mt-8 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--text)]">← Back to home</Link>
      </p>
    </main>
  );
}
