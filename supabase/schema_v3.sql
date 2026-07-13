-- House of Lords — v3: IPDA-style motion striking (Opp strikes first, alternates)

alter table pairings add column if not exists struck_motion_ids uuid[] not null default '{}';
alter table pairings add column if not exists strike_turn text not null default 'opp';   -- 'opp' | 'aff'
alter table pairings add column if not exists final_motion_id uuid references motions(id);

-- Debaters strike via a security-definer RPC so we can enforce the rules server-side.
create or replace function strike_motion(p_pairing uuid, p_motion uuid)
returns pairings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair pairings%rowtype;
  v_email text;
  v_role text;
  v_code text;
  v_side text;
  v_all_motions uuid[];
  v_remaining uuid[];
begin
  v_email := lower(auth.jwt() ->> 'email');

  select * into v_pair from pairings where id = p_pairing for update;
  if not found then raise exception 'pairing not found'; end if;
  if v_pair.final_motion_id is not null then raise exception 'motion already finalized for this room'; end if;

  select role, code into v_role, v_code
  from allowed_users where email = v_email;
  if v_role is null then raise exception 'not authorized'; end if;

  if v_role = 'admin' then
    v_side := v_pair.strike_turn;
  elsif v_code = v_pair.aff_code then
    v_side := 'aff';
  elsif v_code = v_pair.opp_code then
    v_side := 'opp';
  else
    raise exception 'not a debater in this room';
  end if;

  if v_side <> v_pair.strike_turn then
    raise exception 'not your turn: waiting on %', v_pair.strike_turn;
  end if;

  perform 1 from motions where id = p_motion and round_id = v_pair.round_id;
  if not found then raise exception 'motion does not belong to this round'; end if;

  if p_motion = any(v_pair.struck_motion_ids) then
    raise exception 'motion already struck';
  end if;

  update pairings
  set struck_motion_ids = struck_motion_ids || p_motion,
      strike_turn = case when v_pair.strike_turn = 'opp' then 'aff' else 'opp' end
  where id = p_pairing
  returning * into v_pair;

  select array_agg(id) into v_all_motions from motions where round_id = v_pair.round_id;
  select array_agg(m) into v_remaining
  from unnest(coalesce(v_all_motions, '{}'::uuid[])) m
  where not (m = any(v_pair.struck_motion_ids));

  if v_remaining is not null and array_length(v_remaining, 1) = 1 then
    update pairings set final_motion_id = v_remaining[1] where id = v_pair.id
    returning * into v_pair;
  end if;

  return v_pair;
end $$;

grant execute on function strike_motion(uuid, uuid) to authenticated;

-- Admin/judge reset function (start over)
create or replace function reset_strikes(p_pairing uuid)
returns pairings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text; v_role text; v_code text;
  v_pair pairings%rowtype;
begin
  v_email := lower(auth.jwt() ->> 'email');
  select role, code into v_role, v_code from allowed_users where email = v_email;
  if v_role not in ('admin','judge') then raise exception 'only admin/judge can reset'; end if;

  select * into v_pair from pairings where id = p_pairing;
  if v_role = 'judge' and v_code <> v_pair.judge_code then
    raise exception 'judge can only reset own room';
  end if;

  update pairings
  set struck_motion_ids = '{}'::uuid[], strike_turn = 'opp', final_motion_id = null
  where id = p_pairing
  returning * into v_pair;

  return v_pair;
end $$;
grant execute on function reset_strikes(uuid) to authenticated;
