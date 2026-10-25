-- Run this in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.proposal_submissions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  kind text not null check (kind in ('response','date_suggestion','song_suggestion','personal_note')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  notification_email text not null default 'pending' check (notification_email in ('pending','sent','failed','not_configured')),
  notification_whatsapp text not null default 'pending' check (notification_whatsapp in ('pending','sent','failed','not_configured'))
);

create table if not exists public.submission_rate_limits (
  ip_hash text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (ip_hash, window_start)
);

alter table public.proposal_submissions enable row level security;
alter table public.submission_rate_limits enable row level security;
-- No public policies: visitors cannot read submissions or touch rate-limit rows.
revoke all on public.proposal_submissions from anon, authenticated;
revoke all on public.submission_rate_limits from anon, authenticated;
grant all on public.proposal_submissions to service_role;
grant all on public.submission_rate_limits to service_role;

create or replace function public.consume_submission_rate_limit(p_ip_hash text, p_window_start timestamptz, p_limit integer default 8)
returns boolean language plpgsql security definer set search_path = public as $$
declare current_hits integer;
begin
  insert into public.submission_rate_limits(ip_hash, window_start, hits)
  values (p_ip_hash, p_window_start, 1)
  on conflict (ip_hash, window_start) do update
    set hits = public.submission_rate_limits.hits + 1
  returning hits into current_hits;
  return current_hits <= p_limit;
end;
$$;
revoke all on function public.consume_submission_rate_limit(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.consume_submission_rate_limit(text, timestamptz, integer) to service_role;
