-- Digital Mind knowledge base — pgvector schema (Milestone 2).
--
-- Apply to your Supabase project before enabling hybrid retrieval, e.g.:
--   supabase db push          (Supabase CLI, with this repo linked)
-- or paste into the Supabase SQL editor.
--
-- Dimension note: vector(1536) matches the default embeddings model
-- (OpenAI text-embedding-3-small). If you switch models, change 1536 in BOTH
-- the column and the function to your model's output dimension (e.g. voyage-3 =
-- 1024) and keep DIGITAL_MIND_EMBEDDINGS_DIM in sync.

create extension if not exists vector;

create table if not exists dm_chunks (
  id          text primary key,
  text        text not null,
  title       text not null,
  url         text not null,
  source      text,
  heading     text,
  tags        text[] not null default '{}',
  visibility  text  not null default 'public',
  embedding   vector(1536),
  updated_at  timestamptz not null default now()
);

-- Approximate nearest-neighbour index for cosine similarity.
create index if not exists dm_chunks_embedding_idx
  on dm_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists dm_chunks_visibility_idx
  on dm_chunks (visibility);

-- Vector search with the visibility filter enforced in SQL, so the public
-- endpoint can only ever retrieve approved ('public') knowledge.
create or replace function match_dm_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  filter_visibility text default 'public'
)
returns table (
  id text,
  text text,
  title text,
  url text,
  source text,
  heading text,
  tags text[],
  visibility text,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.text,
    c.title,
    c.url,
    c.source,
    c.heading,
    c.tags,
    c.visibility,
    1 - (c.embedding <=> query_embedding) as similarity
  from dm_chunks c
  where c.visibility = filter_visibility
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Lock the table down: with RLS enabled and no policies, only the server-side
-- service-role key can read or write it. The public site never queries this
-- table directly — it goes through the /api/digital-mind/chat function.
alter table dm_chunks enable row level security;
