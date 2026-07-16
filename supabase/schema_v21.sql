-- v21: judge registration + admin approve helpers that upsert into allowed_users
-- so they become login-able immediately after approval.

create table if not exists judge_registrations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  organization text,
  experience text,             -- 'none' | 'some' | 'experienced'
  can_attend boolean not null default false,
  notes text,
  status text not null default 'pending',   -- 'pending' | 'approved' | 'waitlisted' | 'declined'
  assigned_code text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

alter table judge_registrations enable row level security;

drop policy if exists "public inserts judge registration" on judge_registrations;
create policy "public inserts judge registration" on judge_registrations for insert with check (true);

drop policy if exists "admin reads judge registrations" on judge_registrations;
create policy "admin reads judge registrations" on judge_registrations for select
  using (is_admin_email(auth.jwt() ->> 'email'));

drop policy if exists "admin updates judge registrations" on judge_registrations;
create policy "admin updates judge registrations" on judge_registrations for update
  using (is_admin_email(auth.jwt() ->> 'email'))
  with check (is_admin_email(auth.jwt() ->> 'email'));

drop policy if exists "admin deletes judge registrations" on judge_registrations;
create policy "admin deletes judge registrations" on judge_registrations for delete
  using (is_admin_email(auth.jwt() ->> 'email'));

do $$ begin
  begin alter publication supabase_realtime add table judge_registrations; exception when others then null; end;
end $$;

-- Public submit for judges.
create or replace function submit_judge_registration(
  p_full_name text,
  p_email text,
  p_phone text,
  p_organization text,
  p_experience text,
  p_can_attend boolean,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(trim(p_full_name), '') = '' then raise exception 'full_name required'; end if;
  if coalesce(trim(p_email), '') = '' then raise exception 'email required'; end if;
  insert into judge_registrations (full_name, email, phone, organization, experience, can_attend, notes)
  values (trim(p_full_name), lower(trim(p_email)),
          nullif(trim(coalesce(p_phone, '')), ''),
          nullif(trim(coalesce(p_organization, '')), ''),
          nullif(trim(coalesce(p_experience, '')), ''),
          coalesce(p_can_attend, false),
          nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function submit_judge_registration(text, text, text, text, text, boolean, text) to anon, authenticated;

-- Approve a team: upsert every speaker into allowed_users as role='scholar' with their code,
-- and upsert the captain as role='scholar' too (if not already whitelisted otherwise).
-- Returns a list of speakers so the admin UI can loop-send emails.
create or replace function approve_team_registration(p_reg_id uuid)
returns table(speaker_code text, speaker_name text, speaker_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
  v_reg registrations%rowtype;
begin
  v_admin_email := lower(auth.jwt() ->> 'email');
  if not is_admin_email(v_admin_email) then raise exception 'admin only'; end if;

  select * into v_reg from registrations where id = p_reg_id;
  if v_reg.id is null then raise exception 'registration not found'; end if;

  -- Upsert speakers into allowed_users where email exists (skip email-less).
  insert into allowed_users (email, role, code, name)
  select rs.speaker_email, 'scholar', rs.speaker_code, rs.speaker_name
    from registration_speakers rs
    where rs.registration_id = p_reg_id
      and rs.speaker_email is not null
      and rs.speaker_email <> ''
  on conflict (email) do update
    set role = excluded.role,
        code = excluded.code,
        name = coalesce(allowed_users.name, excluded.name);

  update registrations
    set status = 'approved', reviewed_at = now(), reviewed_by = v_admin_email
    where id = p_reg_id;

  return query
    select rs.speaker_code, rs.speaker_name, rs.speaker_email
      from registration_speakers rs
      where rs.registration_id = p_reg_id
      order by rs.order_index;
end;
$$;
grant execute on function approve_team_registration(uuid) to authenticated;

-- Approve a judge: assign next free J-code (J1..J30), upsert into allowed_users.
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

  select * into v_reg from judge_registrations where id = p_reg_id;
  if v_reg.id is null then raise exception 'judge registration not found'; end if;

  -- Find next free J{n} where n in 1..30
  v_code := null;
  for v_n in 1..30 loop
    if not exists (select 1 from allowed_users where code = 'J' || v_n::text)
       and not exists (select 1 from judge_registrations
                       where assigned_code = 'J' || v_n::text and id <> p_reg_id) then
      v_code := 'J' || v_n::text;
      exit;
    end if;
  end loop;
  if v_code is null then raise exception 'no free J-codes (1..30) available'; end if;

  insert into allowed_users (email, role, code, name)
  values (v_reg.email, 'judge', v_code, v_reg.full_name)
  on conflict (email) do update
    set role = 'judge', code = v_code, name = coalesce(allowed_users.name, v_reg.full_name);

  update judge_registrations
    set status = 'approved', reviewed_at = now(), reviewed_by = v_admin_email,
        assigned_code = v_code
    where id = p_reg_id;

  return query select v_code, v_reg.full_name, v_reg.email;
end;
$$;
grant execute on function approve_judge_registration(uuid) to authenticated;
