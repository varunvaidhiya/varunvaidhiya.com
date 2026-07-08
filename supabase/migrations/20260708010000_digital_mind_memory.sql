-- Digital Mind conversation memory + usage (Milestone 5).
--
-- Apply alongside the knowledge-base migration when enabling server-side memory.
-- Tables are RLS-locked with no policies, so only the server-side service-role
-- key can read/write them; the public site never touches them directly.

create table if not exists dm_conversations (
  id          text primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  metadata    jsonb not null default '{}'
);

create table if not exists dm_messages (
  id               bigint generated always as identity primary key,
  conversation_id  text not null references dm_conversations(id) on delete cascade,
  role             text not null,
  content          text not null,
  sources          jsonb not null default '[]',
  created_at       timestamptz not null default now()
);

create index if not exists dm_messages_conversation_idx
  on dm_messages (conversation_id, created_at);

create table if not exists dm_usage (
  id               bigint generated always as identity primary key,
  conversation_id  text,
  model            text,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  retrieval_mode   text,
  created_at       timestamptz not null default now()
);

create index if not exists dm_usage_created_idx on dm_usage (created_at desc);

alter table dm_conversations enable row level security;
alter table dm_messages enable row level security;
alter table dm_usage enable row level security;
