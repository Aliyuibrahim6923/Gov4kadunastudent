-- Kaduna Student Voice: Supabase schema.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create table if not exists public.responses (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),

  -- Identity and contact (confidential)
  name            text not null,
  phone           text not null,
  whatsapp        text,
  email           text,

  -- Profile and location
  institution     text not null,
  level           text not null,
  lga             text not null,
  ward            text not null,
  pu              text,
  pu_code         text,           -- INEC delimitation code, e.g. 18-01-01-001
  gender          text not null,
  age             text not null,
  pvc             text,           -- yes | plan | no

  -- Ratings (1-5, null = not sure / not answered)
  overall         smallint not null check (overall between 1 and 5),
  rate_edu        smallint check (rate_edu between 1 and 5),
  rate_welfare    smallint check (rate_welfare between 1 and 5),
  rate_fees       smallint check (rate_fees between 1 and 5),
  rate_security   smallint check (rate_security between 1 and 5),
  rate_jobs       smallint check (rate_jobs between 1 and 5),
  rate_health     smallint check (rate_health between 1 and 5),
  rate_roads      smallint check (rate_roads between 1 and 5),
  rate_power      smallint check (rate_power between 1 and 5),
  rate_transport  smallint check (rate_transport between 1 and 5),
  rate_ict        smallint check (rate_ict between 1 and 5),
  rate_agric      smallint check (rate_agric between 1 and 5),
  rate_sports     smallint check (rate_sports between 1 and 5),
  rate_gov        smallint check (rate_gov between 1 and 5),

  -- NELFUND
  nelfund         text,
  nelfund_reason  text,
  nelfund_wait    text,
  nelfund_issue   text,
  nelfund_rate    smallint check (nelfund_rate between 1 and 5),

  -- Other programmes
  scholarship     text,
  other_sch       text,
  other_sch_name  text,
  other_sch_issue text,
  transport       text,
  transport_rate  smallint check (transport_rate between 1 and 5),
  empower         text,
  empower_name    text,

  -- Commend and correct
  commend         text[] not null default '{}',
  commend_note    text,
  shortfalls      text[] not null default '{}',
  shortfall_note  text,

  -- Wants and priorities
  want_short      text[] not null default '{}',
  want_long       text[] not null default '{}',
  priorities      text[] not null default '{}' check (cardinality(priorities) <= 3),
  strengthen_note text,
  message         text,

  -- Engagement
  volunteer       boolean not null default false,
  consent         boolean not null check (consent),

  -- Full submission as received, for audit
  raw             jsonb
);

create index if not exists responses_created_at_idx on public.responses (created_at desc);
create index if not exists responses_lga_ward_idx   on public.responses (lga, ward);
create index if not exists responses_institution_idx on public.responses (institution);
create index if not exists responses_phone_idx      on public.responses (phone);

-- Lock the table down. With RLS on and no policies, the public anon key can neither
-- read nor write. Only the server (Vercel functions, using the service role key) can.
alter table public.responses enable row level security;
revoke all on public.responses from anon, authenticated;

-- Handy view for spotting possible duplicate submissions by phone number.
create or replace view public.possible_duplicates
with (security_invoker = true) as
select phone, count(*) as submissions, min(created_at) as first_at, max(created_at) as last_at
from public.responses
group by phone
having count(*) > 1
order by submissions desc;
revoke all on public.possible_duplicates from anon, authenticated;
