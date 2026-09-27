# Repomap

Understand any GitHub codebase. Paste a repository URL and Repomap turns it into structured, AI-ready context you can read, explore, and chat with — grounded in the actual code.

## What it does

1. **Ingest** — fetches repository metadata and the full git tree via the GitHub API, filters out generated/binary/irrelevant files, and scores the rest by importance.
2. **Analyze** — sends a token-budgeted context to Gemini and returns a structured project explanation: summary, architecture, important files, key flows, setup instructions, and a leveled learning path.
3. **Prompt** — generates copy-ready master prompts (Quick / Detailed / Developer) for ChatGPT, Claude, Gemini, Cursor, or Codex.
4. **Chat** — RAG over the repository: files are chunked, embedded into Supabase pgvector, and retrieved per question so answers cite real file paths.

## Tech stack

- Next.js (App Router) + React + TypeScript (strict)
- Tailwind CSS v4 + Radix primitives + Lucide icons
- Supabase PostgreSQL + pgvector
- Gemini API (`@google/genai`) behind a provider interface (`src/lib/ai/provider.ts`)
- GitHub REST + Git Trees APIs
- Vitest for unit tests

## Architecture

```
GitHub URL
  → parse & validate (src/lib/github/parser.ts)
  → metadata + commit (src/lib/github/repository.ts)
  → git tree (src/lib/github/tree.ts)
  → filter (src/lib/ingestion/filter.ts)
  → prioritize (src/lib/ingestion/prioritize.ts)
  → fetch contents, bounded (src/lib/github/client.ts)
  → stats + tech stack (src/lib/ingestion/stats.ts, src/lib/ai/tech-stack.ts)
  → token-budgeted context (src/lib/ingestion/context-builder.ts)
  → AI structured analysis (src/lib/ai/analyze.ts)
  → chunk + embed (src/lib/embeddings/*)
  → persist (src/lib/database/store.ts)
  → /repo/[owner]/[repo]
```

Chat retrieval: question → embedding → vector + keyword hybrid ranking → token-budgeted context → streamed Gemini answer with file citations.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in the values below
pnpm dev
```

Production build:

```bash
pnpm build && pnpm start
```

## Environment variables

See `.env.example`. Required for full functionality:

| Variable | Required for |
| --- | --- |
| `GEMINI_API_KEY` | AI analysis, chat, embeddings ([get a key](https://aistudio.google.com/apikey)) |
| `GITHUB_TOKEN` | Reliable GitHub access (60 → 5000 req/h) |
| `NEXT_PUBLIC_SUPABASE_URL` | Persistence, chat memory, pgvector |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth UI (login page) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side persistence |

The app **runs without Supabase** using an in-memory store (analysis works, data is ephemeral per server instance). AI features require `GEMINI_API_KEY`; without it the app fails gracefully with setup instructions.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Enable the **pgvector** extension (Database → Extensions), or rely on the migration which does `create extension if not exists vector`.
3. Apply the schema:
   - `supabase db push` (linked CLI), or
   - paste `supabase/migrations/0001_init.sql` into the SQL editor.
4. Copy the project URL and keys into `.env.local`.

The migration creates `repositories`, `repository_files`, `repository_chunks` (with `vector(3072)` embeddings + ivfflat index), `analyses`, `chat_sessions`, `chat_messages`, a `match_repository_chunks` RPC, indexes, cascade deletes, and read-only RLS policies. Writes happen only through the server with the service-role key.

## GitHub API setup

Create a [personal access token](https://github.com/settings/tokens) (classic, `public_repo` scope is sufficient) and set `GITHUB_TOKEN`. Requests are authenticated server-side only — the token never reaches the browser. Without a token the app still works for public repositories within unauthenticated rate limits and surfaces a clear 429 message when exhausted.

## Gemini setup

Get an API key from [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY`. Models default to `gemini-2.5-flash` for text and `gemini-embedding-001` for embeddings (3072 dimensions — the pgvector column matches). Override with `GEMINI_TEXT_MODEL` / `GEMINI_EMBEDDING_MODEL`.

## Local development

```bash
pnpm dev            # dev server
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest (parser, filtering, prioritization, tokens, tree, AI parsing)
pnpm build          # production build
```

## Deployment (Vercel)

1. Push the repository to GitHub.
2. Import it in Vercel; the framework preset detects Next.js.
3. Add the environment variables from `.env.example` in Project → Settings → Environment Variables.
4. Deploy. `maxDuration` is raised on analysis/chat routes for long-running ingestion.

## Security considerations

- Repository code is treated as untrusted input: it is never executed, installed, or eval'd.
- Only `github.com`, `api.github.com`, and `raw.githubusercontent.com` are ever fetched; no arbitrary URLs.
- URLs are parsed and validated against GitHub rules (owner/repo charset, reserved paths) before any request.
- Rendered source is escaped; AI-cited file paths are verified against the real tree before display.
- Secrets live in server-only env vars; the GitHub token and service-role key never reach the client.
- Rate limiting on `/api/analyze`, `/api/chat`, `/api/repository/*/refresh`, and `*/explain` (in-process fixed window; swap in Redis for multi-instance deployments).
- Path traversal is prevented by using the Git Trees API paths verbatim and rejecting non-GitHub hosts (no user-controlled base URLs).

## Known limitations

- Private repositories are not supported yet; the architecture anticipates GitHub OAuth (see `src/lib/github/client.ts`) — never paste personal tokens into the app.
- Very large repositories are analyzed from the highest-priority ~300 files within a ~30k-token context; niche code may be outside the analysis context (chat retrieval still reaches everything ingested).
- Embeddings are capped at 300 chunks per analysis to bound cost/latency.
- The in-memory fallback store is per-instance and resets on redeploy — configure Supabase for persistence.

## Roadmap

- GitHub OAuth for private repositories and saved history
- Per-user usage limits and billing
- Streaming token-by-token chat rendering (SSE instead of buffered promise)
- Redis-backed rate limiting
- Mermaid rendering of the architecture diagram
- Local repository ingestion (paste a folder / drag-and-drop)
- Inline code comments grounded in retrieved chunks
