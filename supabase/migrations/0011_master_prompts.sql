-- Master prompt templates that drive the Prompt Generator's Auto Engine.
-- Admin-managed (service role only); active ones are served to the tool.

create table if not exists public.master_prompts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  description text not null default '',
  system_prompt text not null,
  is_active boolean not null default true,
  created_by text
);

create index if not exists idx_master_prompts_created_at
  on public.master_prompts (created_at desc);

-- No client policies: server-only via service role (same as usage_logs).
