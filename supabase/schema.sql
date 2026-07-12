-- House of Lords — Isomo Scholars' Debate
-- Schema for Supabase Postgres

-- ==== Types ====
create type role_t as enum ('scholar','judge','admin');
create type round_state_t as enum ('locked','prep','debate','voting','done');
create type winner_t as enum ('aff','opp');

-- ==== Whitelist (source of truth for auth) ====
create table allowed_users (
  email text primary key,
  role role_t not null,
  code text unique,           -- 'A1', 'J7', or null for admin
  name text,
  created_at timestamptz default now()
);

-- ==== Rounds ====
create table rounds (
  id text primary key,        -- 'R1','R2','R3','R4','R5'
  state round_state_t not null default 'locked',
  motion_id uuid,
  started_at timestamptz,
  ends_at timestamptz
);

-- ==== Motions ====
create table motions (
  id uuid primary key default gen_random_uuid(),
  round_id text references rounds(id),
  kind text,                  -- 'Policy','Value','Metaphor'
  text text not null
);

-- ==== Pairings (from local generator) ====
create table pairings (
  id uuid primary key default gen_random_uuid(),
  round_id text references rounds(id),
  room int not null,
  aff_code text not null,
  opp_code text not null,
  judge_code text not null,
  motion_id uuid references motions(id),  -- assigned per room at round start
  unique(round_id, room)
);

-- ==== Ballots ====
create table ballots (
  id uuid primary key default gen_random_uuid(),
  round_id text references rounds(id),
  room int not null,
  judge_code text not null,
  aff_code text not null,
  opp_code text not null,
  aff_argument int check (aff_argument between 0 and 5),
  aff_rebuttal int check (aff_rebuttal between 0 and 5),
  aff_delivery int check (aff_delivery between 0 and 5),
  aff_persuasion int check (aff_persuasion between 0 and 5),
  opp_argument int check (opp_argument between 0 and 5),
  opp_rebuttal int check (opp_rebuttal between 0 and 5),
  opp_delivery int check (opp_delivery between 0 and 5),
  opp_persuasion int check (opp_persuasion between 0 and 5),
  winner winner_t,
  submitted_at timestamptz default now(),
  unique(round_id, room)
);

-- ==== RLS ====
alter table allowed_users enable row level security;
alter table rounds        enable row level security;
alter table motions       enable row level security;
alter table pairings      enable row level security;
alter table ballots       enable row level security;

-- Anyone authenticated whose email is in allowed_users can read their own row
create policy "self read whitelist"
  on allowed_users for select
  using (auth.jwt() ->> 'email' = email);

-- Rounds: everyone allowed can read
create policy "read rounds" on rounds for select
  using (exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email'));

-- Motions: readable only when round is not locked (admin can see all via bypass)
create policy "read motions when unlocked"
  on motions for select
  using (
    exists (select 1 from rounds r where r.id = motions.round_id and r.state <> 'locked')
    or exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email' and u.role = 'admin')
  );

-- Pairings: readable by allowed users (they need to know their room)
create policy "read pairings" on pairings for select
  using (exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email'));

-- Ballots:
--   judges can read only their own submissions
--   scholars can read only ballots where they were aff or opp
--   admins read all
create policy "read own ballots"
  on ballots for select
  using (
    exists (
      select 1 from allowed_users u
      where u.email = auth.jwt() ->> 'email'
        and (
          u.role = 'admin'
          or (u.role = 'judge'   and u.code = ballots.judge_code)
          or (u.role = 'scholar' and u.code in (ballots.aff_code, ballots.opp_code))
        )
    )
  );

-- Judges can insert their own ballot (matching their code); one per (round,room) enforced by unique
create policy "insert own ballot"
  on ballots for insert
  with check (
    exists (
      select 1 from allowed_users u
      where u.email = auth.jwt() ->> 'email'
        and u.role = 'judge'
        and u.code = ballots.judge_code
    )
  );

-- Admin-only writes on rounds/motions/pairings
create policy "admin writes rounds"   on rounds   for all using (
  exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email' and u.role='admin')
) with check (
  exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email' and u.role='admin')
);
create policy "admin writes motions"  on motions  for all using (
  exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email' and u.role='admin')
) with check (
  exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email' and u.role='admin')
);
create policy "admin writes pairings" on pairings for all using (
  exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email' and u.role='admin')
) with check (
  exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email' and u.role='admin')
);

-- ==== Seeds ====
insert into rounds(id) values ('R1'),('R2'),('R3'),('R4'),('R5')
  on conflict do nothing;
