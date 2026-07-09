-- Digital Mind admin area (Milestone 6).
--
-- Apply after the knowledge-base and memory migrations. Adds storage for
-- admin-uploaded documents and key/value settings (e.g. a persona override),
-- and a doc_id on dm_chunks so an uploaded document's chunks can be deleted as
-- a unit. RLS-locked: only the server-side service-role key touches these.

-- Uploaded documents (durable record; also embedded into dm_chunks).
create table if not exists dm_documents (
  id          text primary key,
  title       text not null,
  content     text not null,
  url         text not null default '',
  tags        text[] not null default '{}',
  visibility  text not null default 'public',
  created_at  timestamptz not null default now()
);

-- Key/value settings (persona override, etc.).
create table if not exists dm_config (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz not null default now()
);

-- Group a document's chunks so admin deletes remove them together.
alter table dm_chunks add column if not exists doc_id text;
create index if not exists dm_chunks_doc_idx on dm_chunks (doc_id);

alter table dm_documents enable row level security;
alter table dm_config enable row level security;
