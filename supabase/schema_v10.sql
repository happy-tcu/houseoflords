-- v10: only admins can reset strikes

create or replace function reset_strikes(p_pairing uuid)
returns pairings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text; v_role text;
  v_pair pairings%rowtype;
begin
  v_email := lower(auth.jwt() ->> 'email');
  select role into v_role from allowed_users where email = v_email;
  if v_role <> 'admin' then raise exception 'only admin can reset strikes'; end if;

  update pairings
  set struck_motion_ids = '{}'::uuid[], strike_turn = 'opp', final_motion_id = null
  where id = p_pairing
  returning * into v_pair;

  return v_pair;
end $$;
grant execute on function reset_strikes(uuid) to authenticated;
