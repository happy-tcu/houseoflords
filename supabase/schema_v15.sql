-- v15: polish -- better bracket, random-side final, clean stale drafts on judge reassign

-- Cleaner build_bracket: uses top-4 by wins/points, distributes judges across all available J-codes,
-- assigns sides in a fair way (1v4 & 2v3 seeded).
create or replace function build_bracket()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top4 text[];
  v_free_judges text[];
begin
  if not is_admin_email(auth.jwt() ->> 'email') then
    raise exception 'admin only'; end if;

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

  if v_top4 is null or array_length(v_top4, 1) < 4 then
    raise exception 'need at least 4 speakers with prelim results';
  end if;

  -- Pick 3 available judge codes (2 semis + 1 final). Prefer judges not conflicted with top-4 speakers.
  select array_agg(u.code order by random()) into v_free_judges
    from allowed_users u
    where u.role = 'judge' and u.code is not null
    limit 3;
  if v_free_judges is null or array_length(v_free_judges, 1) < 3 then
    v_free_judges := array['J1','J2','J3'];
  end if;

  delete from pairings where round_id in ('R4','R5');

  -- 1v4, 2v3 seeded
  insert into pairings (round_id, room, aff_code, opp_code, judge_code)
  values
    ('R4', 1, v_top4[1], v_top4[4], v_free_judges[1]),
    ('R4', 2, v_top4[2], v_top4[3], v_free_judges[2]);

  insert into pairings (round_id, room, aff_code, opp_code, judge_code)
  values ('R5', 1, 'TBD1', 'TBD2', v_free_judges[3]);
end $$;
grant execute on function build_bracket() to authenticated;

-- Randomize sides in fill_final so the winner of Room 1 isn't always Aff.
create or replace function fill_final()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_winners text[];
  v_aff text; v_opp text;
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

  if random() < 0.5 then
    v_aff := v_winners[1]; v_opp := v_winners[2];
  else
    v_aff := v_winners[2]; v_opp := v_winners[1];
  end if;

  update pairings set aff_code = v_aff, opp_code = v_opp
    where round_id = 'R5' and room = 1;
end $$;
grant execute on function fill_final() to authenticated;

-- Clean stale drafts + wipe segment state when a judge is reassigned.
create or replace function reassign_judge(p_pairing uuid, p_new_judge text)
returns pairings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair pairings%rowtype;
  v_old text;
begin
  if not is_admin_email(auth.jwt() ->> 'email') then
    raise exception 'admin only'; end if;
  select judge_code into v_old from pairings where id = p_pairing;
  update pairings set judge_code = p_new_judge where id = p_pairing
    returning * into v_pair;
  -- delete stale drafts owned by the previous judge for this room+round
  delete from ballot_drafts where round_id = v_pair.round_id and room = v_pair.room and judge_code = v_old;
  return v_pair;
end $$;
grant execute on function reassign_judge(uuid, text) to authenticated;
