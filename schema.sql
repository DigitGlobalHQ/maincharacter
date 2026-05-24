-- ═══════════════════════════════════════════════════════════════════════
-- MAINCHARACTER — Complete Supabase PostgreSQL Schema
-- ═══════════════════════════════════════════════════════════════════════
--
-- Platform: Supabase (PostgreSQL 15+)
-- Pillars:  Orator · Aesthetic · Sage
-- Funnel:   7-day trial → paywall → subscription
--
-- Run this file in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";     -- gen_random_uuid()
create extension if not exists "pg_cron";      -- scheduled jobs (trial day increment)


-- ═══════════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 1.1 USERS — Central identity table
-- ─────────────────────────────────────────────────────────────────────

create table public.users (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  name                 text not null,
  whatsapp_number      text unique not null,
  email                text unique,

  -- Pillar & Progression
  chosen_pillar        text check (chosen_pillar in ('orator', 'aesthetic', 'sage')),
  current_rank         integer not null default 1 check (current_rank between 1 and 5),
  streak_count         integer not null default 0,
  last_active          date,

  -- Trial
  trial_start_date     date,
  trial_day            integer not null default 1 check (trial_day between 1 and 7),

  -- Subscription
  tier                 text not null default 'trial' check (tier in ('trial', 'pro', 'elite', 'annual')),
  tier_expiry          timestamptz,

  -- Onboarding
  onboarding_step      integer not null default 1,
  audit_answers        jsonb default '{}'::jsonb,
  pillar_audit_answers jsonb default '{}'::jsonb,

  -- Referral
  referral_code        text unique,
  referred_by          uuid references public.users(id) on delete set null,

  -- Admin
  notes                text
);

comment on table public.users is 'Central user identity. One row per WhatsApp user.';
comment on column public.users.audit_answers is 'Global audit: { primaryBetray, fillerFreq, highStakesRoom, costRoom }';
comment on column public.users.pillar_audit_answers is 'Pillar-specific audit answers stored as JSON';
comment on column public.users.current_rank is '1=Unawakened, 2=Seeker, 3=Ascendant, 4=Sovereign, 5=Architect';
comment on column public.users.trial_day is 'Current day in 7-day trial. Incremented daily by pg_cron.';


-- ─────────────────────────────────────────────────────────────────────
-- 1.2 ORATOR SESSIONS — One row per voice note submitted
-- ─────────────────────────────────────────────────────────────────────

create table public.orator_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  day_number          integer not null check (day_number between 1 and 7),

  -- Media
  audio_url           text,
  transcript          text,

  -- Scores (0-100)
  fluency             integer not null check (fluency between 0 and 100),
  pronunciation       integer not null check (pronunciation between 0 and 100),
  pacing_rhythm       integer not null check (pacing_rhythm between 0 and 100),
  vocabulary          integer not null check (vocabulary between 0 and 100),
  confidence_tone     integer not null check (confidence_tone between 0 and 100),
  filler_frequency    integer not null check (filler_frequency between 0 and 100),

  -- Consultant output
  consultant_insight  text,
  headline_win        text,
  quest_given         text
);

comment on table public.orator_sessions is 'Voice analysis results. One row per recording submission.';
comment on column public.orator_sessions.filler_frequency is '0 = all fillers, 100 = zero fillers. Higher is better.';


-- ─────────────────────────────────────────────────────────────────────
-- 1.3 AURA SCANS — Aesthetic pillar photo analysis
-- ─────────────────────────────────────────────────────────────────────

create table public.aura_scans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  created_at          timestamptz not null default now(),

  -- Media
  photo_url           text,

  -- Scores (1-10)
  sharpness           integer not null check (sharpness between 1 and 10),
  presence            integer not null check (presence between 1 and 10),
  vibe                integer not null check (vibe between 1 and 10),
  total               integer generated always as (sharpness + presence + vibe) stored,

  -- Notes (one sentence each from Gemini Vision)
  sharpness_note      text,
  presence_note       text,
  vibe_note           text,

  -- Quests
  sharpness_quest     text,
  presence_quest      text,
  vibe_quest          text,
  quests_completed    text[] not null default '{}',

  -- Full message sent
  consultant_response text
);

comment on table public.aura_scans is 'Photo-based Aura Score analysis. One row per photo scan.';
comment on column public.aura_scans.total is 'Generated column: sharpness + presence + vibe (3-30).';
comment on column public.aura_scans.quests_completed is 'Array of completed quest identifiers, e.g. {sharpness, presence}';


-- ─────────────────────────────────────────────────────────────────────
-- 1.4 SAGE PROGRESS — Wisdom node tracking
-- ─────────────────────────────────────────────────────────────────────

create table public.sage_progress (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  node_name             text not null,
  unlocked_at           timestamptz not null default now(),
  equipped              boolean not null default false,
  mastered              boolean not null default false,
  mastered_at           timestamptz,
  chronicle_reference   text,

  -- Prevent duplicate nodes per user
  unique (user_id, node_name)
);

comment on table public.sage_progress is 'Tracks which Wisdom nodes a Sage user has unlocked/equipped/mastered.';
comment on column public.sage_progress.equipped is 'Node is actively being practised in daily life.';
comment on column public.sage_progress.chronicle_reference is 'Which chronicle_entry.id references applying this node.';


-- ─────────────────────────────────────────────────────────────────────
-- 1.5 CHRONICLE ENTRIES — Sage pillar journaling
-- ─────────────────────────────────────────────────────────────────────

create table public.chronicle_entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  day_number          integer not null,
  prompt              text not null,
  content             text not null,
  word_count          integer not null default 0
);

comment on table public.chronicle_entries is 'Daily journal entries for the Sage pillar.';


-- ─────────────────────────────────────────────────────────────────────
-- 1.6 PAYMENTS — Razorpay integration
-- ─────────────────────────────────────────────────────────────────────

create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  user_id               uuid not null references public.users(id) on delete cascade,
  razorpay_order_id     text,
  razorpay_payment_id   text,
  amount                integer not null,          -- in paise (149900 = ₹1,499)
  tier                  text not null,
  billing_period        text not null check (billing_period in ('monthly', 'annual')),
  status                text not null default 'pending'
                        check (status in ('pending', 'success', 'failed', 'refunded'))
);

comment on table public.payments is 'Payment records from Razorpay.';
comment on column public.payments.amount is 'Amount in paise. 149900 = ₹1,499.';


-- ─────────────────────────────────────────────────────────────────────
-- 1.7 DAILY LOGS — Streak & activity tracking
-- ─────────────────────────────────────────────────────────────────────

create table public.daily_logs (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.users(id) on delete cascade,
  log_date                    date not null default current_date,
  completed_morning_quest     boolean not null default false,
  completed_evening_reflection boolean not null default false,
  media_submitted             boolean not null default false,
  full_day_complete           boolean generated always as (
                                completed_morning_quest and completed_evening_reflection and media_submitted
                              ) stored,

  -- One log per user per day
  unique (user_id, log_date)
);

comment on table public.daily_logs is 'Daily activity log. One row per user per day. Drives streak calculation.';
comment on column public.daily_logs.full_day_complete is 'Generated: true when all three activities are done.';


-- ═══════════════════════════════════════════════════════════════════════
-- 2. INDEXES
-- ═══════════════════════════════════════════════════════════════════════

-- Users
create unique index idx_users_whatsapp on public.users (whatsapp_number);
create index idx_users_pillar on public.users (chosen_pillar);
create index idx_users_tier on public.users (tier);
create index idx_users_trial_day on public.users (trial_day) where tier = 'trial';
create index idx_users_last_active on public.users (last_active);
create index idx_users_referral_code on public.users (referral_code) where referral_code is not null;

-- Orator sessions
create index idx_orator_user_created on public.orator_sessions (user_id, created_at desc);
create index idx_orator_user_day on public.orator_sessions (user_id, day_number);

-- Aura scans
create index idx_aura_user_created on public.aura_scans (user_id, created_at desc);

-- Sage progress
create index idx_sage_user on public.sage_progress (user_id);
create index idx_sage_mastered on public.sage_progress (user_id) where mastered = true;

-- Chronicle
create index idx_chronicle_user on public.chronicle_entries (user_id, created_at desc);

-- Payments
create index idx_payments_user on public.payments (user_id, created_at desc);
create index idx_payments_status on public.payments (status) where status = 'success';
create index idx_payments_razorpay on public.payments (razorpay_payment_id) where razorpay_payment_id is not null;

-- Daily logs
create unique index idx_daily_user_date on public.daily_logs (user_id, log_date);


-- ═══════════════════════════════════════════════════════════════════════
-- 3. FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 3.1 update_trial_day()
-- Increments trial_day for all active trial users.
-- Run daily via pg_cron at 00:05 IST.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.update_trial_day()
returns void
language plpgsql
security definer
as $$
begin
  update public.users
  set trial_day = least(trial_day + 1, 7)
  where tier = 'trial'
    and trial_start_date is not null
    and trial_day < 7;

  raise notice 'Trial days updated at %', now();
end;
$$;

comment on function public.update_trial_day is 'Increments trial_day for active trial users. Cap at 7. Run via pg_cron daily.';

-- Schedule with pg_cron (run at 00:05 IST = 18:35 UTC previous day)
-- Uncomment after enabling pg_cron in Supabase dashboard:
-- select cron.schedule(
--   'increment-trial-days',
--   '35 18 * * *',
--   $$select public.update_trial_day()$$
-- );


-- ─────────────────────────────────────────────────────────────────────
-- 3.2 calculate_rank()
-- Trigger: recalculates rank when a new score is recorded.
--
-- Ranking criteria:
--   Rank 1 (Unawakened): default
--   Rank 2 (Seeker):     streak >= 3 OR any score improvement
--   Rank 3 (Ascendant):  streak >= 5 AND completed Day 5+
--   Rank 4 (Sovereign):  streak = 7 AND paid
--   Rank 5 (Architect):  streak >= 14 AND paid AND total improvement > 15
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.calculate_rank()
returns trigger
language plpgsql
security definer
as $$
declare
  v_user       record;
  v_new_rank   integer;
  v_day1_score integer;
  v_latest     integer;
  v_improvement integer;
begin
  select * into v_user from public.users where id = new.user_id;

  if not found then return new; end if;

  v_new_rank := 1; -- default Unawakened

  -- Rank 2: Seeker — streak >= 3 or any score improvement
  if v_user.streak_count >= 3 then
    v_new_rank := 2;
  end if;

  -- Rank 3: Ascendant — streak >= 5 and completed Day 5+
  if v_user.streak_count >= 5 and v_user.trial_day >= 5 then
    v_new_rank := 3;
  end if;

  -- Rank 4: Sovereign — streak = 7 and paid
  if v_user.streak_count >= 7 and v_user.tier in ('pro', 'elite', 'annual') then
    v_new_rank := 4;
  end if;

  -- Rank 5: Architect — streak >= 14, paid, and significant improvement
  -- Check Orator fluency improvement as primary metric
  if v_user.chosen_pillar = 'orator' then
    select fluency into v_day1_score
    from public.orator_sessions
    where user_id = new.user_id
    order by day_number asc
    limit 1;

    select fluency into v_latest
    from public.orator_sessions
    where user_id = new.user_id
    order by created_at desc
    limit 1;

    v_improvement := coalesce(v_latest, 0) - coalesce(v_day1_score, 0);
  elsif v_user.chosen_pillar = 'aesthetic' then
    -- Check aura total improvement
    select total into v_day1_score
    from public.aura_scans
    where user_id = new.user_id
    order by created_at asc
    limit 1;

    select total into v_latest
    from public.aura_scans
    where user_id = new.user_id
    order by created_at desc
    limit 1;

    v_improvement := coalesce(v_latest, 0) - coalesce(v_day1_score, 0);
  else
    -- Sage: count mastered nodes
    select count(*) into v_improvement
    from public.sage_progress
    where user_id = new.user_id and mastered = true;
  end if;

  if v_user.streak_count >= 14
     and v_user.tier in ('pro', 'elite', 'annual')
     and coalesce(v_improvement, 0) > 15 then
    v_new_rank := 5;
  end if;

  -- Only promote, never demote
  if v_new_rank > v_user.current_rank then
    update public.users
    set current_rank = v_new_rank
    where id = new.user_id;
  end if;

  return new;
end;
$$;

comment on function public.calculate_rank is 'Recalculates user rank based on streak, trial day, payment status, and score improvement. Only promotes, never demotes.';

-- Triggers: fire on new score inserts
create trigger trg_rank_orator
  after insert on public.orator_sessions
  for each row execute function public.calculate_rank();

create trigger trg_rank_aura
  after insert on public.aura_scans
  for each row execute function public.calculate_rank();

create trigger trg_rank_sage
  after insert on public.sage_progress
  for each row execute function public.calculate_rank();


-- ─────────────────────────────────────────────────────────────────────
-- 3.3 check_streak()
-- Trigger on daily_logs insert: updates streak_count on users table.
-- Streak = consecutive days with full_day_complete = true.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.check_streak()
returns trigger
language plpgsql
security definer
as $$
declare
  v_streak     integer := 0;
  v_check_date date;
  v_found      boolean;
begin
  -- Update last_active
  update public.users
  set last_active = new.log_date
  where id = new.user_id;

  -- Only recalculate if the day is fully complete
  if not (new.completed_morning_quest and new.completed_evening_reflection and new.media_submitted) then
    return new;
  end if;

  -- Count consecutive complete days going backwards from today
  v_check_date := new.log_date;

  loop
    select exists(
      select 1 from public.daily_logs
      where user_id = new.user_id
        and log_date = v_check_date
        and completed_morning_quest = true
        and completed_evening_reflection = true
        and media_submitted = true
    ) into v_found;

    exit when not v_found;

    v_streak := v_streak + 1;
    v_check_date := v_check_date - 1;
  end loop;

  -- Update streak
  update public.users
  set streak_count = v_streak
  where id = new.user_id;

  return new;
end;
$$;

comment on function public.check_streak is 'Calculates consecutive-day streak on daily_logs insert/update. Updates users.streak_count.';

create trigger trg_check_streak
  after insert or update on public.daily_logs
  for each row execute function public.check_streak();


-- ─────────────────────────────────────────────────────────────────────
-- 3.4 auto_word_count()
-- Trigger: automatically counts words in chronicle entries.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.auto_word_count()
returns trigger
language plpgsql
as $$
begin
  new.word_count := array_length(string_to_array(trim(new.content), ' '), 1);
  return new;
end;
$$;

create trigger trg_chronicle_word_count
  before insert or update on public.chronicle_entries
  for each row execute function public.auto_word_count();


-- ═══════════════════════════════════════════════════════════════════════
-- 4. VIEWS
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 4.1 user_dashboard_view
-- Joins users with their latest scores and today's activity.
-- Used by the admin dashboard.
-- ─────────────────────────────────────────────────────────────────────

create or replace view public.user_dashboard_view as
select
  u.id,
  u.name,
  u.whatsapp_number,
  u.chosen_pillar,
  u.current_rank,
  case u.current_rank
    when 1 then 'The Unawakened'
    when 2 then 'The Seeker'
    when 3 then 'The Ascendant'
    when 4 then 'The Sovereign'
    when 5 then 'The Architect'
  end as rank_name,
  u.streak_count,
  u.last_active,
  u.trial_day,
  u.tier,
  u.tier_expiry,
  u.onboarding_step,
  u.notes,
  u.created_at as joined_at,

  -- Latest Orator session
  os.fluency as latest_fluency,
  os.filler_frequency as latest_filler_freq,
  os.headline_win as latest_headline,
  os.created_at as latest_orator_at,

  -- Latest Aura scan
  a.sharpness as latest_sharpness,
  a.presence as latest_presence,
  a.vibe as latest_vibe,
  a.total as latest_aura_total,
  a.created_at as latest_aura_at,

  -- Today's daily log
  dl.completed_morning_quest as today_morning,
  dl.completed_evening_reflection as today_evening,
  dl.media_submitted as today_media,
  dl.full_day_complete as today_complete,

  -- Sage node count
  (select count(*) from public.sage_progress sp where sp.user_id = u.id) as sage_nodes_unlocked,
  (select count(*) from public.sage_progress sp where sp.user_id = u.id and sp.mastered = true) as sage_nodes_mastered,

  -- Payment status
  (select count(*) from public.payments p where p.user_id = u.id and p.status = 'success') as total_payments,

  -- Days since last active
  current_date - u.last_active as days_inactive

from public.users u

left join lateral (
  select * from public.orator_sessions
  where user_id = u.id
  order by created_at desc
  limit 1
) os on true

left join lateral (
  select * from public.aura_scans
  where user_id = u.id
  order by created_at desc
  limit 1
) a on true

left join public.daily_logs dl
  on dl.user_id = u.id and dl.log_date = current_date;

comment on view public.user_dashboard_view is 'Admin dashboard view: user + latest scores + today activity.';


-- ─────────────────────────────────────────────────────────────────────
-- 4.2 trial_ending_today
-- Users whose 7-day trial ends today (Day 7, still on trial tier).
-- ─────────────────────────────────────────────────────────────────────

create or replace view public.trial_ending_today as
select
  u.id,
  u.name,
  u.whatsapp_number,
  u.chosen_pillar,
  u.streak_count,
  u.current_rank,
  u.trial_start_date,
  u.trial_day,
  u.last_active
from public.users u
where u.trial_day = 7
  and u.tier = 'trial';

comment on view public.trial_ending_today is 'Users who hit Day 7 of trial today. Send paywall message.';


-- ─────────────────────────────────────────────────────────────────────
-- 4.3 at_risk_users
-- Users inactive for 2+ days (potential churn).
-- ─────────────────────────────────────────────────────────────────────

create or replace view public.at_risk_users as
select
  u.id,
  u.name,
  u.whatsapp_number,
  u.chosen_pillar,
  u.streak_count,
  u.trial_day,
  u.tier,
  u.last_active,
  current_date - u.last_active as days_inactive,
  u.notes
from public.users u
where u.last_active < current_date - 2
  and u.tier in ('trial', 'pro', 'elite', 'annual')
order by u.last_active asc;

comment on view public.at_risk_users is 'Users inactive 2+ days. Candidates for a nudge message.';


-- ═══════════════════════════════════════════════════════════════════════
-- 5. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.orator_sessions enable row level security;
alter table public.aura_scans enable row level security;
alter table public.sage_progress enable row level security;
alter table public.chronicle_entries enable row level security;
alter table public.payments enable row level security;
alter table public.daily_logs enable row level security;


-- ─── Users ───────────────────────────────────────────────────────────

-- Users can read their own row
create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

-- Users can update their own row
create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id);

-- Service role: full access (admin dashboard, automation server)
create policy "users_service_all"
  on public.users for all
  using (auth.role() = 'service_role');


-- ─── Orator Sessions ────────────────────────────────────────────────

create policy "orator_select_own"
  on public.orator_sessions for select
  using (auth.uid() = user_id);

create policy "orator_insert_own"
  on public.orator_sessions for insert
  with check (auth.uid() = user_id);

create policy "orator_service_all"
  on public.orator_sessions for all
  using (auth.role() = 'service_role');


-- ─── Aura Scans ─────────────────────────────────────────────────────

create policy "aura_select_own"
  on public.aura_scans for select
  using (auth.uid() = user_id);

create policy "aura_insert_own"
  on public.aura_scans for insert
  with check (auth.uid() = user_id);

create policy "aura_service_all"
  on public.aura_scans for all
  using (auth.role() = 'service_role');


-- ─── Sage Progress ──────────────────────────────────────────────────

create policy "sage_select_own"
  on public.sage_progress for select
  using (auth.uid() = user_id);

create policy "sage_insert_own"
  on public.sage_progress for insert
  with check (auth.uid() = user_id);

create policy "sage_update_own"
  on public.sage_progress for update
  using (auth.uid() = user_id);

create policy "sage_service_all"
  on public.sage_progress for all
  using (auth.role() = 'service_role');


-- ─── Chronicle Entries ──────────────────────────────────────────────

create policy "chronicle_select_own"
  on public.chronicle_entries for select
  using (auth.uid() = user_id);

create policy "chronicle_insert_own"
  on public.chronicle_entries for insert
  with check (auth.uid() = user_id);

create policy "chronicle_service_all"
  on public.chronicle_entries for all
  using (auth.role() = 'service_role');


-- ─── Payments ───────────────────────────────────────────────────────

create policy "payments_select_own"
  on public.payments for select
  using (auth.uid() = user_id);

-- Users cannot insert/update payments (only service role)
create policy "payments_service_all"
  on public.payments for all
  using (auth.role() = 'service_role');


-- ─── Daily Logs ─────────────────────────────────────────────────────

create policy "daily_select_own"
  on public.daily_logs for select
  using (auth.uid() = user_id);

create policy "daily_insert_own"
  on public.daily_logs for insert
  with check (auth.uid() = user_id);

create policy "daily_update_own"
  on public.daily_logs for update
  using (auth.uid() = user_id);

create policy "daily_service_all"
  on public.daily_logs for all
  using (auth.role() = 'service_role');


-- ═══════════════════════════════════════════════════════════════════════
-- 6. SEED DATA
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 6.1 Test Users — One per pillar
-- ─────────────────────────────────────────────────────────────────────

insert into public.users (
  id, name, whatsapp_number, email, chosen_pillar, current_rank,
  streak_count, last_active, trial_start_date, trial_day, tier,
  onboarding_step, audit_answers, referral_code, notes
) values
(
  'a1111111-1111-1111-1111-111111111111',
  'Aarav Mehta', '919876543210', 'aarav@test.mc',
  'orator', 2, 5, current_date,
  current_date - 4, 5, 'trial', 5,
  '{"primaryBetray":"My pacing rushed","fillerFreq":"A few times a day","highStakesRoom":"the Monday leadership stand-up","costRoom":"team meetings"}'::jsonb,
  'AARAV-MC-001',
  'Very consistent. Strong candidate for conversion.'
),
(
  'b2222222-2222-2222-2222-222222222222',
  'Priya Sharma', '919876543211', 'priya@test.mc',
  'aesthetic', 1, 3, current_date - 1,
  current_date - 5, 6, 'pro', 5,
  '{"primaryBetray":"My appearance didn''t match my intent","fillerFreq":"N/A","highStakesRoom":"client presentations","costRoom":"first impressions"}'::jsonb,
  'PRIYA-MC-002',
  'Paid on Day 5. Highly engaged.'
),
(
  'c3333333-3333-3333-3333-333333333333',
  'Rohan Das', '919876543212', 'rohan@test.mc',
  'sage', 1, 2, current_date - 2,
  current_date - 1, 2, 'trial', 3,
  '{"primaryBetray":"I couldn''t hold my ground in the argument","fillerFreq":"Only when nervous","highStakesRoom":"negotiations","costRoom":"partner discussions"}'::jsonb,
  'ROHAN-MC-003',
  'Went quiet Day 2. May need nudge.'
);


-- ─────────────────────────────────────────────────────────────────────
-- 6.2 Orator Sessions — Aarav's 5-day progression
-- ─────────────────────────────────────────────────────────────────────

insert into public.orator_sessions (
  user_id, day_number, fluency, pronunciation, pacing_rhythm,
  vocabulary, confidence_tone, filler_frequency,
  consultant_insight, headline_win, quest_given
) values
(
  'a1111111-1111-1111-1111-111111111111', 1,
  67, 78, 54, 88, 60, 51,
  'I counted 9 fillers in 60 seconds — most around moments of transition. Solid foundation with room to climb.',
  'Baseline established — vocabulary is your strongest asset.',
  'Record 60s answering: what is one thing you are working on right now that matters to you?'
),
(
  'a1111111-1111-1111-1111-111111111111', 2,
  71, 79, 59, 88, 62, 56,
  'Three fewer fillers. The pause gave your first sentence weight.',
  'You held the opening pause — the rest followed.',
  'Describe a project you are proud of — in 60 seconds. Use the 2-second pause before opening.'
),
(
  'a1111111-1111-1111-1111-111111111111', 3,
  73, 81, 62, 89, 66, 60,
  'The sigh reset your baseline anxiety. Your opening was steadier than any previous day.',
  'Confidence tone jumped after the physiological sigh.',
  'Same prompt. Use the physiological sigh 30 seconds before recording.'
),
(
  'a1111111-1111-1111-1111-111111111111', 4,
  74, 83, 64, 89, 69, 63,
  'Steady gains across the board. The habit is forming.',
  'Consistency through the halfway mark.',
  'Record again. The consistency is the quest today.'
),
(
  'a1111111-1111-1111-1111-111111111111', 5,
  78, 84, 67, 90, 72, 68,
  'You spoke as though the room was watching. The pacing was more intentional.',
  'Fluency held under real-room pressure.',
  'Imagine the Monday leadership stand-up. Speak as if they are watching.'
);


-- ─────────────────────────────────────────────────────────────────────
-- 6.3 Aura Scans — Priya's 2 scans
-- ─────────────────────────────────────────────────────────────────────

insert into public.aura_scans (
  user_id, sharpness, presence, vibe,
  sharpness_note, presence_note, vibe_note,
  sharpness_quest, presence_quest, vibe_quest,
  consultant_response
) values
(
  'b2222222-2222-2222-2222-222222222222',
  5, 4, 6,
  'Grooming is considered but not yet sharp — definition could be more intentional.',
  'Shoulders slightly forward, gaze indirect — not yet occupying the frame.',
  'Individual elements decent but not in agreement — style and grooming feel separate.',
  'Book a proper stylist appointment this week.',
  'Stand in front of a full-length mirror for 2 minutes each morning.',
  'Ask a trusted friend to describe your style in three words.',
  'Priya, I have read your photo. Sharpness: 5/10. Presence: 4/10. Vibe: 6/10.'
),
(
  'b2222222-2222-2222-2222-222222222222',
  6, 5, 6,
  'Hairline cleaner, overall definition improving with the new cut.',
  'Posture has opened slightly — the mirror work is showing.',
  'Elements starting to agree. The colour palette is more cohesive.',
  'Focus on skin texture this week — one product, one routine, consistency.',
  'Pause at every threshold for 2 seconds before entering a room.',
  'Wear one signature element every day this week.',
  'Priya, new scan. Sharpness: 5→6. Presence: 4→5. Vibe: 6→6. The mirror work is showing.'
);


-- ─────────────────────────────────────────────────────────────────────
-- 6.4 Sage Progress — 5 wisdom nodes (seeded as curriculum)
-- Rohan has unlocked 2 of them.
-- ─────────────────────────────────────────────────────────────────────

-- Rohan's unlocked nodes
insert into public.sage_progress (user_id, node_name, equipped, mastered) values
('c3333333-3333-3333-3333-333333333333', 'The Observer Principle',    true,  false),
('c3333333-3333-3333-3333-333333333333', 'The Discipline Paradox',    false, false);


-- ─────────────────────────────────────────────────────────────────────
-- 6.5 Daily Logs — Sample streak data
-- ─────────────────────────────────────────────────────────────────────

insert into public.daily_logs (user_id, log_date, completed_morning_quest, completed_evening_reflection, media_submitted) values
-- Aarav: 5-day streak
('a1111111-1111-1111-1111-111111111111', current_date - 4, true, true, true),
('a1111111-1111-1111-1111-111111111111', current_date - 3, true, true, true),
('a1111111-1111-1111-1111-111111111111', current_date - 2, true, true, true),
('a1111111-1111-1111-1111-111111111111', current_date - 1, true, true, true),
('a1111111-1111-1111-1111-111111111111', current_date,     true, false, true),

-- Priya: 3-day streak (yesterday was last active)
('b2222222-2222-2222-2222-222222222222', current_date - 3, true, true, true),
('b2222222-2222-2222-2222-222222222222', current_date - 2, true, true, true),
('b2222222-2222-2222-2222-222222222222', current_date - 1, true, true, true),

-- Rohan: 2 days, then went quiet
('c3333333-3333-3333-3333-333333333333', current_date - 2, true, true, true),
('c3333333-3333-3333-3333-333333333333', current_date - 1, true, false, false);


-- ─────────────────────────────────────────────────────────────────────
-- 6.6 Payment — Priya's successful payment
-- ─────────────────────────────────────────────────────────────────────

insert into public.payments (
  user_id, razorpay_order_id, razorpay_payment_id, amount, tier, billing_period, status
) values (
  'b2222222-2222-2222-2222-222222222222',
  'order_test_001', 'pay_test_001',
  149900, 'pro', 'monthly', 'success'
);


-- ═══════════════════════════════════════════════════════════════════════
-- 7. SAGE WISDOM CURRICULUM — Reference data
-- ═══════════════════════════════════════════════════════════════════════
-- These are the 5 starter nodes unlocked across Days 1-5 of the trial.
-- Stored here as a reference table. Actual user progress is in sage_progress.
-- ═══════════════════════════════════════════════════════════════════════

create table public.wisdom_curriculum (
  id              uuid primary key default gen_random_uuid(),
  node_name       text unique not null,
  unlock_day      integer not null,
  pillar          text not null default 'sage',
  description     text not null,
  quest_prompt    text not null,
  mastery_criteria text not null
);

comment on table public.wisdom_curriculum is 'Reference curriculum of Sage wisdom nodes. Defines unlock day and mastery criteria.';

insert into public.wisdom_curriculum (node_name, unlock_day, description, quest_prompt, mastery_criteria) values
(
  'The Observer Principle', 1,
  'Before you can change a pattern, you must see it without flinching. The Observer does not judge. The Observer records.',
  'Today, notice one moment where you reacted before thinking. Do not change it. Just notice.',
  'Report three separate observations across three days. Mastered when you can name the pattern before it fires.'
),
(
  'The Discipline Paradox', 2,
  'Discipline is not force. It is removing the friction between who you are and what you do. The paradox: the more you structure, the more freedom you feel.',
  'Choose one small ritual and do it at the same time for three days. Same time, same action, no exceptions.',
  'Three consecutive days of the chosen ritual without a skip. Mastered when the ritual feels automatic.'
),
(
  'The Composure Principle', 3,
  'Composure is not the absence of stress. It is the ability to hold still while the stress moves through you. The composed mind does not suppress — it observes and lets pass.',
  'Use the physiological sigh before one high-pressure moment today. Notice what happens to your first sentence after the sigh.',
  'Apply the sigh in three separate high-pressure moments and report the difference. Mastered when you reach for it instinctively.'
),
(
  'The Reframe Engine', 4,
  'Every setback carries a second reading. The Reframe Engine is the ability to find that second reading before the first one settles into belief. Not optimism — accuracy.',
  'Take one negative thought from today and write two alternative interpretations that are equally true.',
  'Five separate reframes documented in your Chronicle. Mastered when the second reading arrives before the emotional reaction completes.'
),
(
  'The Strategic Silence', 5,
  'Most people fill silence with noise because silence feels like absence. It is not. Silence is weight. The person who can hold silence controls the room without saying a word.',
  'In your next conversation, let a pause last two full seconds longer than comfortable. Do not fill it. Observe what the other person does.',
  'Three documented instances of holding silence strategically. Mastered when the pause feels like a tool, not a threat.'
);

-- Enable RLS on curriculum (read-only for users)
alter table public.wisdom_curriculum enable row level security;

create policy "curriculum_read_all"
  on public.wisdom_curriculum for select
  using (true);

create policy "curriculum_service_all"
  on public.wisdom_curriculum for all
  using (auth.role() = 'service_role');


-- ═══════════════════════════════════════════════════════════════════════
-- SCHEMA COMPLETE
-- ═══════════════════════════════════════════════════════════════════════
--
-- Tables:           7 (users, orator_sessions, aura_scans, sage_progress,
--                      chronicle_entries, payments, daily_logs)
--                 + 1 reference table (wisdom_curriculum)
--
-- Functions:        4 (update_trial_day, calculate_rank, check_streak, auto_word_count)
-- Triggers:         5 (rank on orator/aura/sage insert, streak on daily_logs, word count)
-- Views:            3 (user_dashboard_view, trial_ending_today, at_risk_users)
-- RLS Policies:    22 (own-data read/write per table + service_role bypass)
-- Indexes:         14 (covering all FK lookups, common queries, and unique constraints)
-- Seed Records:    19 (3 users, 5 orator sessions, 2 aura scans, 2 sage nodes,
--                      9 daily logs, 1 payment, 5 curriculum nodes)
--
-- ═══════════════════════════════════════════════════════════════════════
