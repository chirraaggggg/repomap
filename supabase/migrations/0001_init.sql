-- Repomap schema: repositories, files, chunks (pgvector), analyses, chat.
-- Apply with: supabase db push  (or paste into the SQL editor)

create extension if not exists vector;

-- ─── repositories ────────────────────────────────────────────────────────────
create table if not exists public.repositories (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  name text not null,
  url text not null,
  branch text not null default 'main',
  commit_sha text not null default '',
  created_at timestamptz not null default now(),
  unique (owner, name, branch)
);

-- ─── repository_files ────────────────────────────────────────────────────────
create table if not exists public.repository_files (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories(id) on delete cascade,
  path text not null,
  language text,
  size integer not null default 0,
  content text not null default '',
  importance_score integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists repository_files_repo_idx on public.repository_files (repository_id);
create index if not exists repository_files_repo_path_idx on public.repository_files (repository_id, path);

-- ─── repository_chunks (pgvector) ────────────────────────────────────────────
create table if not exists public.repository_chunks (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories(id) on delete cascade,
  file_path text not null,
  content text not null,
  start_line integer not null default 1,
  end_line integer not null default 1,
  embedding vector(3072),
  created_at timestamptz not null default now()
);
create index if not exists repository_chunks_repo_idx on public.repository_chunks (repository_id);
create index if not exists repository_chunks_embedding_idx
  on public.repository_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ─── analyses ────────────────────────────────────────────────────────────────
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories(id) on delete cascade,
  payload jsonb not null,
  master_prompt text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists analyses_repo_idx on public.analyses (repository_id);

-- ─── chat_sessions / chat_messages ───────────────────────────────────────────
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories(id) on delete cascade,
  session_key text not null unique,
  title text not null default 'New chat',
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_key text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  references jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on public.chat_messages (session_key, created_at);

alter table public.chat_sessions
  add constraint chat_sessions_repo_fk
  foreign key (repository_id) references public.repositories(id) on delete cascade;

-- ─── vector search RPC ───────────────────────────────────────────────────────
create or replace function public.match_repository_chunks(
  p_repository_id uuid,
  p_query_embedding vector(3072),
  p_match_count integer default 12
)
returns table (
  id uuid,
  file_path text,
  content text,
  start_line integer,
  end_line integer,
  similarity double precision
)
language sql stable
as $$
  select
    c.id,
    c.file_path,
    c.content,
    c.start_line,
    c.end_line,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.repository_chunks c
  where c.repository_id = p_repository_id
    and c.embedding is not null
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- The server uses the service-role key (bypasses RLS). The anon key gets
-- read access to analyses/chat for the demo; writes happen server-side only.
alter table public.repositories enable row level security;
alter table public.repository_files enable row level security;
alter table public.repository_chunks enable row level security;
alter table public.analyses enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "public read repositories" on public.repositories for select using (true);
create policy "public read files" on public.repository_files for select using (true);
create policy "public read chunks" on public.repository_chunks for select using (true);
create policy "public read analyses" on public.analyses for select using (true);
create policy "public read chat sessions" on public.chat_sessions for select using (true);
create policy "public read chat messages" on public.chat_messages for select using (true);
