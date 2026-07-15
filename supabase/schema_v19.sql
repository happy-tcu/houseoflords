-- v19: on registration submission, mirror speakers into allowed_users so
-- their code + email become a real login-able identity that pairings and
-- ballots already reference. Preserves the admin WhitelistTab as a manual
-- override — this only adds automatic promotion, doesn't remove anything.

drop function if exists submit_registration(text, text, text, text, text, text, text, text, jsonb);

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
  v_email text;
  v_name text;
  v_existing_email text;
  v_existing_code text;
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

  -- Pre-flight: check every filled speaker with an email or code against
  -- allowed_users BEFORE inserting anything. Fail fast so the captain can
  -- fix and resubmit without a half-written registration.
  for v_row in select * from jsonb_array_elements(p_speakers) loop
    v_name  := trim(coalesce(v_row->>'name', ''));
    if v_name = '' then continue; end if;
    v_code  := upper(nullif(trim(coalesce(v_row->>'code',  '')), ''));
    v_email := nullif(lower(trim(coalesce(v_row->>'email', ''))), '');

    if v_code is not null then
      if v_code !~ '^[A-F](?:[1-9]|10)$' then
        raise exception 'speaker_code % is invalid', v_code;
      end if;
      if left(v_code, 1) <> v_letter then
        raise exception 'speaker_code % does not belong to class %', v_code, v_letter;
      end if;
      select email into v_existing_code from allowed_users where code = v_code;
      if v_existing_code is not null and v_existing_code <> coalesce(v_email, '') then
        raise exception 'speaker code % is already assigned to %', v_code, v_existing_code;
      end if;
    end if;

    if v_email is not null then
      select code into v_existing_email from allowed_users where email = v_email;
      if v_existing_email is not null and coalesce(v_existing_email, '') <> coalesce(v_code, '') then
        raise exception 'email % is already registered under code %', v_email, v_existing_email;
      end if;
    end if;
  end loop;

  -- Insert the registration row.
  insert into registrations (class_name, team_name, class_letter, school_name, captain_name,
                             captain_email, captain_phone, cohort, notes)
  values (trim(p_team_name),
          trim(p_team_name),
          v_letter,
          nullif(trim(coalesce(p_school_name, '')), ''),
          trim(p_captain_name),
          lower(trim(p_captain_email)),
          nullif(trim(coalesce(p_captain_phone, '')), ''),
          nullif(trim(coalesce(p_cohort, '')), ''),
          nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_reg_id;

  -- Insert speaker rows AND mirror each one into allowed_users so
  -- pairings.aff_code / ballots.judge_code / auth.email all resolve.
  for v_row in select * from jsonb_array_elements(p_speakers) loop
    v_i := v_i + 1;
    v_name  := trim(coalesce(v_row->>'name', ''));
    if v_name = '' then continue; end if;
    v_code  := upper(nullif(trim(coalesce(v_row->>'code',  '')), ''));
    v_email := nullif(lower(trim(coalesce(v_row->>'email', ''))), '');

    insert into registration_speakers (registration_id, speaker_name, speaker_email, speaker_phone,
                                       speaker_year, speaker_code, order_index)
    values (v_reg_id,
            v_name,
            v_email,
            nullif(trim(coalesce(v_row->>'phone', '')), ''),
            nullif(trim(coalesce(v_row->>'year',  '')), ''),
            v_code,
            v_i);

    -- Only mirror rows that have both an email (allowed_users PK) and a code
    -- (what pairings/ballots key off). Rows missing either stay in
    -- registration_speakers and can be promoted later via the admin
    -- WhitelistTab manual override.
    if v_email is not null and v_code is not null then
      insert into allowed_users (email, role, code, name)
      values (v_email, 'scholar', v_code, v_name);
    end if;
  end loop;

  return v_reg_id;
end;
$$;

grant execute on function submit_registration(text, text, text, text, text, text, text, text, jsonb)
  to anon, authenticated;
