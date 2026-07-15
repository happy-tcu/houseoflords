-- v17: team registration by class captains

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  class_name text not null,
  school_name text,
  captain_name text not null,
  captain_email text not null,
  captain_phone text,
  cohort text,                    -- 'y1' | 'y2' | 'mixed' | null
  notes text,
  status text not null default 'pending',   -- 'pending' | 'approved' | 'waitlisted' | 'declined'
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

create table if not exists registration_speakers (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  speaker_name text not null,
  speaker_email text,
  speaker_phone text,
  speaker_year text,              -- 'Y1' | 'Y2' | 'S6' etc.
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists registration_speakers_registration_idx
  on registration_speakers(registration_id);

alter table registrations enable row level security;
alter table registration_speakers enable row level security;

-- Public can submit (anonymous captain registering their class)
drop policy if exists "public inserts registration" on registrations;
create policy "public inserts registration" on registrations for insert with check (true);

drop policy if exists "public inserts registration speaker" on registration_speakers;
create policy "public inserts registration speaker" on registration_speakers for insert with check (true);

-- Only admin reads / updates / deletes
drop policy if exists "admin reads registrations" on registrations;
create policy "admin reads registrations" on registrations for select
  using (is_admin_email(auth.jwt() ->> 'email'));

drop policy if exists "admin reads registration speakers" on registration_speakers;
create policy "admin reads registration speakers" on registration_speakers for select
  using (is_admin_email(auth.jwt() ->> 'email'));

drop policy if exists "admin updates registrations" on registrations;
create policy "admin updates registrations" on registrations for update
  using (is_admin_email(auth.jwt() ->> 'email'))
  with check (is_admin_email(auth.jwt() ->> 'email'));

drop policy if exists "admin deletes registrations" on registrations;
create policy "admin deletes registrations" on registrations for delete
  using (is_admin_email(auth.jwt() ->> 'email'));

drop policy if exists "admin deletes registration speakers" on registration_speakers;
create policy "admin deletes registration speakers" on registration_speakers for delete
  using (is_admin_email(auth.jwt() ->> 'email'));

-- Realtime
do $$ begin
  begin alter publication supabase_realtime add table registrations; exception when others then null; end;
  begin alter publication supabase_realtime add table registration_speakers; exception when others then null; end;
end $$;

-- Atomic submit: creates registration + all speakers in one call.
-- Returns the new registration id.
create or replace function submit_registration(
  p_class_name text,
  p_school_name text,
  p_captain_name text,
  p_captain_email text,
  p_captain_phone text,
  p_cohort text,
  p_notes text,
  p_speakers jsonb            -- array of { name, email, phone, year }
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg_id uuid;
  v_row jsonb;
  v_i int := 0;
begin
  if coalesce(trim(p_class_name), '') = '' then
    raise exception 'class_name required';
  end if;
  if coalesce(trim(p_captain_name), '') = '' then
    raise exception 'captain_name required';
  end if;
  if coalesce(trim(p_captain_email), '') = '' then
    raise exception 'captain_email required';
  end if;
  if jsonb_array_length(p_speakers) < 2 then
    raise exception 'at least 2 speakers required';
  end if;

  insert into registrations (class_name, school_name, captain_name, captain_email, captain_phone, cohort, notes)
  values (trim(p_class_name), nullif(trim(coalesce(p_school_name, '')), ''),
          trim(p_captain_name), lower(trim(p_captain_email)),
          nullif(trim(coalesce(p_captain_phone, '')), ''),
          nullif(trim(coalesce(p_cohort, '')), ''),
          nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_reg_id;

  for v_row in select * from jsonb_array_elements(p_speakers) loop
    v_i := v_i + 1;
    if coalesce(trim(v_row->>'name'), '') = '' then continue; end if;
    insert into registration_speakers (registration_id, speaker_name, speaker_email, speaker_phone, speaker_year, order_index)
    values (v_reg_id,
            trim(v_row->>'name'),
            nullif(lower(trim(coalesce(v_row->>'email', ''))), ''),
            nullif(trim(coalesce(v_row->>'phone', '')), ''),
            nullif(trim(coalesce(v_row->>'year', '')), ''),
            v_i);
  end loop;

  return v_reg_id;
end;
$$;

grant execute on function submit_registration(text, text, text, text, text, text, text, jsonb) to anon, authenticated;
