-- v18: split class letter (A–F) from team name, add speaker code (A1..F10)
-- Additive/safe — works whether or not schema_v17 was already applied.

alter table registrations add column if not exists class_letter char(1);
alter table registrations add column if not exists team_name text;
alter table registration_speakers add column if not exists speaker_code text;

-- Constrain class letter to A..F when set.
do $$ begin
  begin
    alter table registrations
      add constraint registrations_class_letter_chk
      check (class_letter is null or class_letter in ('A','B','C','D','E','F'));
  exception when duplicate_object then null;
  end;
end $$;

-- Speaker code follows the {letter}{1..10} pattern.
do $$ begin
  begin
    alter table registration_speakers
      add constraint registration_speakers_code_chk
      check (speaker_code is null or speaker_code ~ '^[A-F](?:[1-9]|10)$');
  exception when duplicate_object then null;
  end;
end $$;

-- One speaker_code per registration.
create unique index if not exists registration_speakers_reg_code_uidx
  on registration_speakers(registration_id, speaker_code)
  where speaker_code is not null;

-- Replace RPC with the new signature.
drop function if exists submit_registration(text, text, text, text, text, text, text, jsonb);

create or replace function submit_registration(
  p_class_letter text,
  p_team_name text,
  p_school_name text,
  p_captain_name text,
  p_captain_email text,
  p_captain_phone text,
  p_cohort text,
  p_notes text,
  p_speakers jsonb            -- array of { code, name, email, phone, year }
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg_id uuid;
  v_row jsonb;
  v_i int := 0;
  v_letter text;
  v_code text;
begin
  v_letter := upper(coalesce(trim(p_class_letter), ''));
  if v_letter not in ('A','B','C','D','E','F') then
    raise exception 'class_letter must be A–F';
  end if;
  if coalesce(trim(p_team_name), '') = '' then
    raise exception 'team_name required';
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

  insert into registrations (class_name, team_name, class_letter, school_name, captain_name,
                             captain_email, captain_phone, cohort, notes)
  values (trim(p_team_name),                     -- keep class_name populated (NOT NULL from v17)
          trim(p_team_name),
          v_letter,
          nullif(trim(coalesce(p_school_name, '')), ''),
          trim(p_captain_name),
          lower(trim(p_captain_email)),
          nullif(trim(coalesce(p_captain_phone, '')), ''),
          nullif(trim(coalesce(p_cohort, '')), ''),
          nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_reg_id;

  for v_row in select * from jsonb_array_elements(p_speakers) loop
    v_i := v_i + 1;
    if coalesce(trim(v_row->>'name'), '') = '' then continue; end if;
    v_code := upper(nullif(trim(coalesce(v_row->>'code', '')), ''));
    if v_code is not null and v_code !~ '^[A-F](?:[1-9]|10)$' then
      raise exception 'speaker_code % is invalid', v_code;
    end if;
    if v_code is not null and left(v_code, 1) <> v_letter then
      raise exception 'speaker_code % does not belong to class %', v_code, v_letter;
    end if;
    insert into registration_speakers (registration_id, speaker_name, speaker_email, speaker_phone,
                                       speaker_year, speaker_code, order_index)
    values (v_reg_id,
            trim(v_row->>'name'),
            nullif(lower(trim(coalesce(v_row->>'email', ''))), ''),
            nullif(trim(coalesce(v_row->>'phone', '')), ''),
            nullif(trim(coalesce(v_row->>'year', '')), ''),
            v_code,
            v_i);
  end loop;

  return v_reg_id;
end;
$$;

grant execute on function submit_registration(text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
