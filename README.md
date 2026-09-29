# RepoTutor

Understand any GitHub codebase.

RepoTutor turns any public GitHub repository into an interactive, AI-powered guide. Explore architecture, understand files, trace code flows, and chat with the codebase — no sign-in, no database, no setup.

## How it works

1. **Paste a URL** — any public `github.com` repository URL (branch URLs work too).
2. **Analyze** — RepoTutor ingests the repository (tree → filter → prioritize → fetch → stats → token-budgeted context) and returns a structured project explanation: summary, architecture, important files, key flows, setup instructions, and a leveled learning path.
3. **Explore** — browse the real file tree, open any file, and get per-file explanations ("Explain file" / "Find references").
4. **Chat** — grounded Q&A over the repository: files are chunked and retrieved by keyword relevance per question so answers cite real file paths.
5. **Prompt** — generate copy-ready master prompts (Quick / Detailed / Developer) for ChatGPT, Claude, Gemini, Cursor, or Codex.

## AI providers (BYOK)

RepoTutor ships with a hosted provider (**RepoTutor AI**, powered by Groq with an OpenRouter fallback). You can also bring your own key:

- Open **AI settings** (navbar, gear icon).
- Pick **Groq — BYOK** or **OpenRouter — BYOK** and paste your key.
- Use **Test Key** to verify, **Clear key** to remove.

BYOK keys live only in the memory of your browser tab for the session. They are sent per-request over HTTPS to the RepoTutor API (never to the provider directly from the browser), and are never stored, logged, or persisted — a page refresh clears them. If a BYOK provider fails, RepoTutor tells you and lets you retry or switch; it never silently substitutes its own key.

### Fallback policy (RepoTutor AI only)

RepoTutor's Groq key falls back to RepoTutor's OpenRouter key **once** on transient failures (rate limits, provider outages, timeouts) with bounded backoff. Auth errors, invalid requests, and oversized contexts are never retried. BYOK requests never fall back to RepoTutor keys.

## Features

- GitHub repository analysis
- Repository tree + file viewer
- Tech stack detection
- Architecture understanding
- Important file detection
- AI-ready prompt generation
- Repository chat (grounded in real file paths)
- Learning path
- BYOK (Groq, OpenRouter)

## Tech stack

- Next.js (App Router)
- TypeScript (strict)
- Tailwind CSS 4
- GitHub API (`src/lib/github`)
- AI provider abstraction (`src/lib/ai`): Groq + OpenRouter, OpenAI-compatible

## Setup

1. Clone the repository.
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Create `.env.local` (copy `.env.example`):

   ```bash
   cp .env.example .env.local
   ```

4. Add a GitHub token — create a [personal access token](https://github.com/settings/tokens) (classic, `public_repo` scope is sufficient) and set `GITHUB_TOKEN`. Requests are authenticated server-side only — the token never reaches the browser. Without a token the app still works for public repositories within unauthenticated rate limits and surfaces a clear 429 message when exhausted.

5. Add AI provider keys (all server-side only):
   - `GROQ_API_KEY` — get one at [console.groq.com/keys](https://console.groq.com/keys). Used for RepoTutor AI.
   - `OPENROUTER_API_KEY` — optional fallback provider (models configurable via `OPENROUTER_TEXT_MODEL`, default `openrouter/free`).
   - Without any key, ingestion/browsing/prompts still work; AI features return a clear "AI service is not configured." error. Users can supply their own key via AI settings.

6. Run the development server:

   ```bash
   pnpm dev
   ```

Open [http://localhost:3000](http://localhost:3000), paste a repository URL, and click **Analyze Repository**.

## Rate limits

Server-side application limits (per anonymous client, configurable in `.env.local`):

| Endpoint | Default | Env var |
| --- | --- | --- |
| Analyze | 3/hour | `RATE_LIMIT_ANALYZE` |
| Chat | 20/hour | `RATE_LIMIT_CHAT` |
| Explain file | 10/hour | `RATE_LIMIT_EXPLAIN` |
| Refresh | 3/hour | `RATE_LIMIT_REFRESH` |

BYOK requests use separate, higher buckets (3× the default) so bringing your own key does not consume the service's quota — but is still bounded.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit tests |

## Architecture

```
RepoTutor (Next.js)
├── Homepage
├── Repository analysis (/repo/[owner]/[repo], 6 tabs)
├── Repository files
├── Prompt generator
└── Repository chat
    │
    ├── GitHub API (server-side)
    │   ├── Repository metadata
    │   ├── Repository tree
    │   └── File contents
    ├── Ingestion engine
    │   ├── Filtering
    │   ├── Prioritization
    │   ├── Chunking
    │   └── Token estimation
    └── AI layer (src/lib/ai)
        ├── manager.ts — BYOK resolution + fallback policy
        ├── providers/groq.ts
        ├── providers/openrouter.ts
        └── openai-compatible.ts — shared request plumbing
```

No authentication and no database for the MVP — analyses live in a process-level in-memory store with a sessionStorage mirror per browser tab (a SQL or vector store can be added later; see Limitations).

## Security

- `GITHUB_TOKEN`, `GROQ_API_KEY`, and `OPENROUTER_API_KEY` are read server-side only (`process.env` in route handlers); never prefixed `NEXT_PUBLIC_*`, never sent to the client.
- BYOK keys travel only in request bodies over HTTPS, are validated server-side, and are never persisted, logged, or echoed.
- Repository code is read, never executed.
- Only `github.com` URLs are accepted (SSRF-safe validation, private repos rejected).
- Repository size, file count, file size, and AI context are all bounded (`src/lib/ingestion`).
- Secrets and `.env*` files are always excluded from prompts and ingestion.
- Repository content is treated as untrusted data — never as instructions to the AI (prompt-injection hardening).

## Limitations

- **Ephemeral storage**: analyses live in memory per server instance and in the analyzing tab's sessionStorage; redeploys or restarts clear the server copy (re-analyzing is cheap, and the Files tab still works from the live GitHub API). The store interface is designed so a database can be added later without touching route handlers.
- **Keyword retrieval**: chat retrieval is keyword-based (Groq has no embedding endpoint). It works well for code; a vector store can be layered in later.
- **Private repositories** are not supported; the server's own `GITHUB_TOKEN` is used for higher rate limits, never user tokens.
- **Provider rate limits** apply; the UI surfaces clear, actionable error messages (including for BYOK keys).
