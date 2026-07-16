-- v22: fix "column reference assigned_code is ambiguous" in approve_judge_registration.
-- The RETURNS TABLE column collided with the judge_registrations column of the same name.

create or replace function approve_judge_registration(p_reg_id uuid)
returns table(assigned_code text, judge_name text, judge_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
  v_reg judge_registrations%rowtype;
  v_code text;
  v_n int;
begin
  v_admin_email := lower(auth.jwt() ->> 'email');
  if not is_admin_email(v_admin_email) then raise exception 'admin only'; end if;

  select * into v_reg from judge_registrations jr where jr.id = p_reg_id;
  if v_reg.id is null then raise exception 'judge registration not found'; end if;

  -- Find next free J{n} where n in 1..30
  v_code := null;
  for v_n in 1..30 loop
    if not exists (select 1 from allowed_users au where au.code = 'J' || v_n::text)
       and not exists (select 1 from judge_registrations jr2
                       where jr2.assigned_code = 'J' || v_n::text and jr2.id <> p_reg_id) then
      v_code := 'J' || v_n::text;
      exit;
    end if;
  end loop;
  if v_code is null then raise exception 'no free J-codes (1..30) available'; end if;

  insert into allowed_users (email, role, code, name)
  values (v_reg.email, 'judge', v_code, v_reg.full_name)
  on conflict (email) do update
    set role = 'judge', code = v_code, name = coalesce(allowed_users.name, v_reg.full_name);

  update judge_registrations jr
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = v_admin_email,
        assigned_code = v_code
    where jr.id = p_reg_id;

  return query
    select v_code::text as assigned_code,
           v_reg.full_name::text as judge_name,
           v_reg.email::text as judge_email;
end;
$$;

grant execute on function approve_judge_registration(uuid) to authenticated;
