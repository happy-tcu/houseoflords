-- v14: case-insensitive email in all remaining RLS policies + public read on
-- pairings/ballots/motions/rounds for /standings + logged-out /assignments to work.

-- ROUNDS
drop policy if exists "read rounds" on rounds;
create policy "read rounds" on rounds for select
  using (
    true  -- public: anyone can see round state
  );

drop policy if exists "admin writes rounds" on rounds;
create policy "admin writes rounds" on rounds for all
  using (is_admin_email(auth.jwt() ->> 'email'))
  with check (is_admin_email(auth.jwt() ->> 'email'));

-- MOTIONS
drop policy if exists "read motions when unlocked" on motions;
create policy "read motions when unlocked"
  on motions for select
  using (
    exists (select 1 from rounds r where r.id = motions.round_id and r.state <> 'locked')
    or is_admin_email(auth.jwt() ->> 'email')
  );

drop policy if exists "admin writes motions" on motions;
create policy "admin writes motions" on motions for all
  using (is_admin_email(auth.jwt() ->> 'email'))
  with check (is_admin_email(auth.jwt() ->> 'email'));

-- PAIRINGS
drop policy if exists "read pairings" on pairings;
create policy "read pairings" on pairings for select using (true);  -- public

drop policy if exists "admin writes pairings" on pairings;
create policy "admin writes pairings" on pairings for all
  using (is_admin_email(auth.jwt() ->> 'email'))
  with check (is_admin_email(auth.jwt() ->> 'email'));

drop policy if exists "judge writes own room segment" on pairings;
create policy "judge writes own room segment" on pairings for update
  using (
    exists (select 1 from allowed_users u
            where u.email = lower(auth.jwt() ->> 'email')
              and u.role = 'judge'
              and u.code = pairings.judge_code)
  )
  with check (
    exists (select 1 from allowed_users u
            where u.email = lower(auth.jwt() ->> 'email')
              and u.role = 'judge'
              and u.code = pairings.judge_code)
  );

-- BALLOTS
drop policy if exists "read own ballots" on ballots;
create policy "read own ballots" on ballots for select using (true);  -- public read

drop policy if exists "insert own ballot" on ballots;
create policy "insert own ballot" on ballots for insert
  with check (
    exists (select 1 from allowed_users u
            where u.email = lower(auth.jwt() ->> 'email')
              and u.role = 'judge'
              and u.code = ballots.judge_code)
  );

-- ANNOUNCEMENTS (already fine, but idempotent)
drop policy if exists "read announcements" on announcements;
create policy "read announcements" on announcements for select
  using (
    exists (select 1 from allowed_users u
            where u.email = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists "admin writes announcements" on announcements;
create policy "admin writes announcements" on announcements for all
  using (is_admin_email(auth.jwt() ->> 'email'))
  with check (is_admin_email(auth.jwt() ->> 'email'));
