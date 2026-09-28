-- Adobe Tracker: response cache, tool settings, site API key pool and
-- the shared daily search counter. All server-only via service role
-- (no client RLS policies - same as master_prompts / usage_logs).

-- Search response cache (sha1 of mode|query|limit|offset|sort|type|ai|provider).
create table if not exists public.adobe_tracker_cache (
  cache_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Single-row tool configuration (id must be 1).
create table if not exists public.adobe_tracker_settings (
  id integer primary key check (id = 1),
  cfg jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Site API key pool (Apify tokens) with automatic failover.
create table if not exists public.adobe_tracker_keys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  label text not null default '',
  key text not null,
  active boolean not null default true
);

-- Shared daily search counter (UTC day key, e.g. 2026-09-28).
create table if not exists public.adobe_tracker_usage (
  day text primary key,
  searches integer not null default 0,
  updated_at timestamptz not null default now()
);
