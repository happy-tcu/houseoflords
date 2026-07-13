-- House of Lords — v2 additions
-- Adds per-room timer state, ballot notes, announcements, and Realtime enablement.

-- Per-room timer state
alter table pairings add column if not exists segment text not null default 'idle';
alter table pairings add column if not exists segment_ends_at timestamptz;

-- Judge feedback on ballots
alter table ballots add column if not exists aff_note text;
alter table ballots add column if not exists opp_note text;

-- Announcements (admin broadcasts)
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  kind text not null default 'info',   -- 'info' | 'warn' | 'urgent'
  created_at timestamptz default now()
);
alter table announcements enable row level security;
drop policy if exists "read announcements" on announcements;
create policy "read announcements" on announcements for select
  using (exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email'));
drop policy if exists "admin writes announcements" on announcements;
create policy "admin writes announcements" on announcements for all
  using (exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email' and u.role='admin'))
  with check (exists (select 1 from allowed_users u where u.email = auth.jwt() ->> 'email' and u.role='admin'));

-- Judges can update segment/segment_ends_at for their own room
drop policy if exists "judge writes own room segment" on pairings;
create policy "judge writes own room segment"
  on pairings for update
  using (
    exists (select 1 from allowed_users u
            where u.email = auth.jwt() ->> 'email'
              and u.role = 'judge'
              and u.code = pairings.judge_code)
  )
  with check (
    exists (select 1 from allowed_users u
            where u.email = auth.jwt() ->> 'email'
              and u.role = 'judge'
              and u.code = pairings.judge_code)
  );

-- Enable Realtime on the tables we watch
alter publication supabase_realtime add table rounds;
alter publication supabase_realtime add table pairings;
alter publication supabase_realtime add table ballots;
alter publication supabase_realtime add table announcements;
alter publication supabase_realtime add table motions;
