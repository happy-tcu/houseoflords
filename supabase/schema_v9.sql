-- v9: track invite/opened/accepted lifecycle on allowed_users

alter table allowed_users add column if not exists invited_at         timestamptz;
alter table allowed_users add column if not exists email_opened_at    timestamptz;
alter table allowed_users add column if not exists first_signed_in_at timestamptz;
alter table allowed_users add column if not exists last_seen_at       timestamptz;

-- Called by the client on each session bootstrap
create or replace function touch_self()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
begin
  if v_email is null then return; end if;
  update allowed_users
     set last_seen_at = now(),
         first_signed_in_at = coalesce(first_signed_in_at, now())
   where email = v_email;
end $$;

grant execute on function touch_self() to authenticated;

-- Called by the resend-webhook edge function using the service role
create or replace function mark_email_opened(p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  update allowed_users
     set email_opened_at = coalesce(email_opened_at, now())
   where email = lower(p_email);
$$;

grant execute on function mark_email_opened(text) to service_role;
