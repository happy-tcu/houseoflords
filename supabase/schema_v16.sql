-- v16: certificate approval workflow

create table if not exists certificate_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  placement text not null default 'participant',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by text,
  signature_name text
);

alter table certificate_requests enable row level security;

drop policy if exists "read certificate requests" on certificate_requests;
create policy "read certificate requests" on certificate_requests for select using (true);

drop policy if exists "insert certificate request" on certificate_requests;
create policy "insert certificate request" on certificate_requests for insert with check (true);

drop policy if exists "admin approves certificate" on certificate_requests;
create policy "admin approves certificate" on certificate_requests for update
  using (is_admin_email(auth.jwt() ->> 'email'))
  with check (is_admin_email(auth.jwt() ->> 'email'));

drop policy if exists "admin deletes certificate" on certificate_requests;
create policy "admin deletes certificate" on certificate_requests for delete
  using (is_admin_email(auth.jwt() ->> 'email'));

do $$ begin
  begin alter publication supabase_realtime add table certificate_requests; exception when others then null; end;
end $$;

-- Approve helper — sets timestamps and signature_name from caller's allowed_users.name
create or replace function approve_certificate(p_request uuid)
returns certificate_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role text;
  v_name text;
  v_row certificate_requests%rowtype;
begin
  v_email := lower(auth.jwt() ->> 'email');
  select role, name into v_role, v_name from allowed_users where email = v_email;
  if v_role <> 'admin' then raise exception 'admin only'; end if;

  update certificate_requests
    set approved_at = now(),
        approved_by = v_email,
        signature_name = coalesce(v_name, 'Isomo Faculty')
    where id = p_request
    returning * into v_row;
  return v_row;
end $$;
grant execute on function approve_certificate(uuid) to authenticated;
