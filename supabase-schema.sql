-- =====================================================================
-- WhatsApp AI Agent — full schema. Idempotent: safe to re-run.
-- Run this in Supabase > SQL Editor for a fresh project.
--
-- This file mirrors the 7 numbered migrations applied via Supabase MCP:
--   001_create_conversations_and_messages
--   002_indexes
--   003_enable_realtime
--   004_storage_media_bucket
--   005_rls_with_anon_read
--   006_remove_broad_storage_select
--   007_index_reply_to_fk
-- =====================================================================

-- ----- 001: Tables ----------------------------------------------------
create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  phone text unique not null,
  name text,
  avatar_url text,
  mode text not null default 'agent' check (mode in ('agent', 'human')),
  unread_count int not null default 0,
  last_message_preview text,
  last_message_type text,
  is_typing boolean not null default false,
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);
comment on table conversations is 'WhatsApp conversations grouped by phone number';

-- Idempotent column adds for existing installs upgrading from the
-- original lakshit77 schema.
alter table conversations add column if not exists avatar_url text;
alter table conversations add column if not exists unread_count int not null default 0;
alter table conversations add column if not exists last_message_preview text;
alter table conversations add column if not exists last_message_type text;
alter table conversations add column if not exists is_typing boolean not null default false;
-- Multi-context router state (added for the unified GSG agent that serves
-- Goods, Brand, and Sell-Safe Buy-Safe from a single WhatsApp number).
alter table conversations add column if not exists active_context text not null default 'brand';
alter table conversations add column if not exists context_switched_at timestamp with time zone;
alter table conversations add column if not exists context_switch_reason text;
do $$ begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'conversations_active_context_check'
  ) then
    alter table conversations add constraint conversations_active_context_check
      check (active_context in ('goods', 'escrow', 'brand'));
  end if;
end $$;

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text,
  media_url text,
  media_type text check (media_type in ('image', 'video', 'audio', 'voice', 'document', 'sticker')),
  media_mime text,
  media_filename text,
  media_size_bytes bigint,
  media_duration_secs int,
  status text not null default 'sent' check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  reply_to uuid references messages(id) on delete set null,
  whatsapp_msg_id text unique,
  created_at timestamp with time zone default now()
);
comment on table messages is 'Individual WhatsApp messages (text + media) within a conversation';

-- Allow text-only OR media-only messages
do $$
begin
  alter table messages add constraint messages_text_or_media_chk
    check (content is not null or media_url is not null);
exception when duplicate_object then null; end $$;

-- ----- 002: Indexes ---------------------------------------------------
create index if not exists idx_messages_conversation       on messages(conversation_id, created_at);
create index if not exists idx_messages_whatsapp_msg_id    on messages(whatsapp_msg_id);
create index if not exists idx_conversations_updated       on conversations(updated_at desc);
create index if not exists idx_conversations_phone         on conversations(phone);

-- ----- 003: Realtime --------------------------------------------------
-- Add tables to the supabase_realtime publication so the dashboard
-- gets live updates over websockets.
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table conversations;
exception when duplicate_object then null; end $$;

-- REPLICA IDENTITY FULL ensures Realtime delivers complete row payloads
-- for UPDATE/DELETE events (needed for is_typing toggles, status ticks,
-- unread_count bumps, etc.)
alter table messages replica identity full;
alter table conversations replica identity full;

-- ----- 004: Storage bucket for inbound + dashboard-uploaded media -----
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)  -- 50 MB
on conflict (id) do update set public = true, file_size_limit = 52428800;

-- ----- 005: Row Level Security ---------------------------------------
-- The service role bypasses RLS, so server-side writes always work.
-- Anon SELECT is required so Realtime can deliver row payloads to the
-- browser. The dashboard never writes from the browser, so we don't
-- expose INSERT/UPDATE/DELETE to anon.
alter table conversations enable row level security;
alter table messages      enable row level security;

do $$ begin
  create policy "Anon read conversations" on conversations
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Anon read messages" on messages
    for select using (true);
exception when duplicate_object then null; end $$;

-- ----- 006: Storage object policies ----------------------------------
-- The 'media' bucket is public, so files are served by direct URL
-- without any RLS check. We deliberately do NOT add a broad
-- "Public read media" SELECT policy on storage.objects, because that
-- would allow clients to LIST every file in the bucket and harvest
-- metadata. Dropping any pre-existing version of that policy:
drop policy if exists "Public read media" on storage.objects;

-- If you ever want browser uploads (skipping our server route), enable:
-- do $$ begin
--   create policy "Anon insert media" on storage.objects
--     for insert with check (bucket_id = 'media');
-- exception when duplicate_object then null; end $$;

-- ----- 007: Cover the reply_to FK ------------------------------------
-- Postgres needs an index on the referencing column, otherwise FK
-- checks during DELETE cascade do a full table scan.
create index if not exists idx_messages_reply_to on messages(reply_to);
