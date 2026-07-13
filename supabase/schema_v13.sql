-- v13: attendance, ballot drafts, audience-targeted announcements, auto-done trigger, bracket RPC

-- 1. Attendance
alter table pairings add column if not exists absent_aff boolean not null default false;
alter table pairings add column if not exists absent_opp boolean not null default false;

-- 2. Announcement audience
alter table announcements add column if not exists audience text not null default 'all';
-- 'all' | 'scholars' | 'judges' | 'admins'

-- 3. Ballot drafts (never see submitted ballots — separate)
create table if not exists ballot_drafts (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references rounds(id),
  room int not null,
  judge_code text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(round_id, room, judge_code)
);
alter table ballot_drafts enable row level security;

drop policy if exists "judge rw own draft" on ballot_drafts;
create policy "judge rw own draft" on ballot_drafts for all
  using (
    exists (select 1 from allowed_users u
            where u.email = lower(auth.jwt() ->> 'email')
              and u.role = 'judge'
              and u.code = ballot_drafts.judge_code)
    or is_admin_email(auth.jwt() ->> 'email')
  )
  with check (
    exists (select 1 from allowed_users u
            where u.email = lower(auth.jwt() ->> 'email')
              and u.role = 'judge'
              and u.code = ballot_drafts.judge_code)
    or is_admin_email(auth.jwt() ->> 'email')
  );

-- Enable Realtime
do $$ begin
  begin alter publication supabase_realtime add table ballot_drafts; exception when others then null; end;
end $$;

-- 4. Auto-advance round → done when all pairings have a ballot (or both sides absent)
create or replace function maybe_mark_round_done(p_round text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_ballots int;
  v_walkovers int;
begin
  select count(*) into v_total from pairings where round_id = p_round;
  if v_total = 0 then return; end if;

  select count(*) into v_ballots from ballots where round_id = p_round;
  select count(*) into v_walkovers from pairings
    where round_id = p_round and (absent_aff or absent_opp);

  if v_ballots + v_walkovers >= v_total then
    update rounds set state = 'done', ends_at = coalesce(ends_at, now())
    where id = p_round and state <> 'done';
  end if;
end $$;
grant execute on function maybe_mark_round_done(text) to authenticated;

create or replace function trg_maybe_done_ballot()
returns trigger language plpgsql as $$
begin perform maybe_mark_round_done(new.round_id); return new; end $$;
drop trigger if exists ballot_maybe_done on ballots;
create trigger ballot_maybe_done after insert on ballots
  for each row execute function trg_maybe_done_ballot();

create or replace function trg_maybe_done_pairing()
returns trigger language plpgsql as $$
begin
  if new.absent_aff or new.absent_opp then
    perform maybe_mark_round_done(new.round_id);
  end if;
  return new;
end $$;
drop trigger if exists pairing_maybe_done on pairings;
create trigger pairing_maybe_done after update of absent_aff, absent_opp on pairings
  for each row execute function trg_maybe_done_pairing();

-- 5. Reassign judge for a specific room
create or replace function reassign_judge(p_pairing uuid, p_new_judge text)
returns pairings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair pairings%rowtype;
begin
  if not is_admin_email(auth.jwt() ->> 'email') then
    raise exception 'admin only'; end if;
  update pairings set judge_code = p_new_judge where id = p_pairing
    returning * into v_pair;
  return v_pair;
end $$;
grant execute on function reassign_judge(uuid, text) to authenticated;

-- 6. Semi/Final bracket generator — creates 2 pairings for R4 from top 4, and 1 pairing for R5 (final)
create or replace function build_bracket()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top4 text[];
  v_free_judge text;
begin
  if not is_admin_email(auth.jwt() ->> 'email') then
    raise exception 'admin only'; end if;

  -- Score each speaker across prelims: wins primary, points secondary
  select array_agg(code order by wins desc, pts desc, code) into v_top4 from (
    select code, sum(wins) as wins, sum(pts) as pts from (
      select p.aff_code as code,
             case when b.winner = 'aff' then 1 else 0 end as wins,
             coalesce(b.aff_argument,0)+coalesce(b.aff_rebuttal,0)+coalesce(b.aff_delivery,0)+coalesce(b.aff_persuasion,0) as pts
        from pairings p join ballots b on b.round_id = p.round_id and b.room = p.room
        where p.round_id in ('R1','R2','R3')
      union all
      select p.opp_code as code,
             case when b.winner = 'opp' then 1 else 0 end as wins,
             coalesce(b.opp_argument,0)+coalesce(b.opp_rebuttal,0)+coalesce(b.opp_delivery,0)+coalesce(b.opp_persuasion,0) as pts
        from pairings p join ballots b on b.round_id = p.round_id and b.room = p.room
        where p.round_id in ('R1','R2','R3')
    ) x group by code
  ) y limit 4;

  if array_length(v_top4, 1) < 4 then
    raise exception 'need at least 4 speakers with prelim results';
  end if;

  -- Wipe old R4/R5 pairings
  delete from pairings where round_id in ('R4','R5');

  -- R4 semis: seed 1v4, 2v3 in rooms 1 and 2
  insert into pairings (round_id, room, aff_code, opp_code, judge_code)
  values
    ('R4', 1, v_top4[1], v_top4[4], (select coalesce(judge_code,'J1') from pairings where round_id='R1' and room=1)),
    ('R4', 2, v_top4[2], v_top4[3], (select coalesce(judge_code,'J2') from pairings where round_id='R1' and room=2));

  -- R5 final: winners of R4 fill in later; use placeholders TBD1/TBD2
  insert into pairings (round_id, room, aff_code, opp_code, judge_code)
  values ('R5', 1, 'TBD1', 'TBD2', (select coalesce(judge_code,'J1') from pairings where round_id='R1' and room=1));
end $$;
grant execute on function build_bracket() to authenticated;

-- 7. Once R4 ballots are in, fill R5 with the two winners
create or replace function fill_final()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_winners text[];
begin
  if not is_admin_email(auth.jwt() ->> 'email') then
    raise exception 'admin only'; end if;
  select array_agg(case when b.winner='aff' then p.aff_code else p.opp_code end
                   order by p.room)
    into v_winners
    from pairings p join ballots b on b.round_id = p.round_id and b.room = p.room
    where p.round_id = 'R4';
  if v_winners is null or array_length(v_winners,1) < 2 then
    raise exception 'need both R4 ballots first'; end if;

  update pairings set aff_code = v_winners[1], opp_code = v_winners[2]
    where round_id = 'R5' and room = 1;
end $$;
grant execute on function fill_final() to authenticated;
