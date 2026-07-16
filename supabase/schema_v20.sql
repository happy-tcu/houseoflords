-- v20: lock team registration at exactly 10 speakers per class.

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
  v_filled_count int := 0;
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

  -- Count filled speakers.
  select count(*) into v_filled_count
  from jsonb_array_elements(p_speakers) sp
  where coalesce(trim(sp->>'name'), '') <> '';
  if v_filled_count <> 10 then
    raise exception 'exactly 10 speakers required (got %)', v_filled_count;
  end if;

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

  for v_row in select * from jsonb_array_elements(p_speakers) loop
    v_i := v_i + 1;
    if coalesce(trim(v_row->>'name'), '') = '' then continue; end if;
    v_code := upper(nullif(trim(coalesce(v_row->>'code', '')), ''));
    -- If code is missing, auto-assign {letter}{row-index}.
    if v_code is null then
      v_code := v_letter || v_i::text;
    end if;
    if v_code !~ '^[A-F](?:[1-9]|10)$' then
      raise exception 'speaker_code % is invalid', v_code;
    end if;
    if left(v_code, 1) <> v_letter then
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
