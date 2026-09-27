# RepoMap

Understand any GitHub codebase.

RepoMap turns a public GitHub repository into structured AI-ready context you can understand, explore, and chat with — no sign-in, no database, no setup.

## How it works

1. **Paste a URL** — any public `github.com` repository URL (branch URLs work too).
2. **Analyze** — RepoMap ingests the repository (tree → filter → prioritize → fetch → stats → token-budgeted context), sends that context to Groq, and returns a structured project explanation: summary, architecture, important files, key flows, setup instructions, and a leveled learning path.
3. **Prompt** — generates copy-ready master prompts (Quick / Detailed / Developer) for ChatGPT, Claude, Gemini, Cursor, or Codex.
4. **Chat** — grounded Q&A over the repository: files are chunked and retrieved by keyword relevance per question so answers cite real file paths.

## Features

- GitHub repository analysis
- Repository tree
- Tech stack detection
- Architecture understanding
- Important file detection
- AI-ready prompt generation
- Repository chat (grounded in real file paths)
- Learning path

## Tech stack

- Next.js (App Router)
- TypeScript (strict)
- Tailwind CSS 4
- GitHub API (`src/lib/github`)
- Groq API — OpenAI-compatible endpoint (`src/lib/ai/groq.ts`)

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

5. Add a Groq API key — get one at [console.groq.com/keys](https://console.groq.com/keys) and set `GROQ_API_KEY`. Without it the app works for ingestion, browsing, and prompts, and AI features return a clear "AI service is not configured." error.

6. Run the development server:

   ```bash
   pnpm dev
   ```

Open [http://localhost:3000](http://localhost:3000), paste a repository URL, and click **Analyze Repository**.

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
RepoMap (Next.js)
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
    └── AI layer
        └── Groq (OpenAI-compatible)
```

No authentication and no database for the MVP — analyses live in a process-level in-memory store (a SQL or vector store can be added later; see Limitations).

## Security

- `GITHUB_TOKEN` and `GROQ_API_KEY` are read server-side only (`process.env` in route handlers); never prefixed `NEXT_PUBLIC_*`, never sent to the client.
- Repository code is read, never executed.
- Only `github.com` URLs are accepted (SSRF-safe validation, private repos rejected).
- Repository size, file count, file size, and AI context are all bounded (`src/lib/ingestion`).
- Secrets and `.env*` files are always excluded from prompts and ingestion.

## Limitations

- **Ephemeral storage**: analyses live in memory per server instance; redeploys or restarts clear them (re-analyzing is cheap). The store interface is designed so a database can be added later without touching route handlers.
- **Keyword retrieval**: chat retrieval is keyword-based (Groq has no embedding endpoint). It works well for code; a vector store can be layered in later.
- **Private repositories** are not supported; the server's own `GITHUB_TOKEN` is used for higher rate limits, never user tokens.
- **Groq rate limits** apply during analysis; the UI surfaces a clear retry message on HTTP 429.
