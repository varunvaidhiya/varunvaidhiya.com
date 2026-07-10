-- Digital Mind — harden match_dm_chunks (security follow-up).
--
-- Pins the function's search_path and fully-qualifies its references (table,
-- type, and the pgvector `<=>` operator) so it no longer trips Supabase's
-- `function_search_path_mutable` linter. Functionally identical to the original
-- definition in 20260708000000_digital_mind_kb.sql — this replaces it in place,
-- and runs after that table + function already exist on a fresh `db push`.

create or replace function match_dm_chunks(
  query_embedding public.vector(1536),
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
set search_path = ''
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
    1 - (c.embedding operator(public.<=>) query_embedding) as similarity
  from public.dm_chunks c
  where c.visibility = filter_visibility
    and c.embedding is not null
  order by c.embedding operator(public.<=>) query_embedding
  limit match_count;
$$;
