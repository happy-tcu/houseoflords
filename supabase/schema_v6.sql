-- v6: fix recursive RLS on allowed_users using a SECURITY DEFINER helper

create or replace function is_admin_email(check_email text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from allowed_users
    where email = lower(check_email) and role = 'admin'
  );
$$;

grant execute on function is_admin_email(text) to authenticated, anon;

-- Reset overlapping policies
drop policy if exists "self read whitelist"  on allowed_users;
drop policy if exists "admin manages whitelist" on allowed_users;
drop policy if exists "read own or if admin" on allowed_users;
drop policy if exists "admin writes"          on allowed_users;
drop policy if exists "admin updates"         on allowed_users;
drop policy if exists "admin deletes"         on allowed_users;

-- SELECT: your own row, or any row if you're admin
create policy "read own or if admin"
  on allowed_users for select
  using (
    lower(auth.jwt() ->> 'email') = email
    or is_admin_email(auth.jwt() ->> 'email')
  );

-- Only admins can INSERT / UPDATE / DELETE
create policy "admin writes"
  on allowed_users for insert
  with check (is_admin_email(auth.jwt() ->> 'email'));

create policy "admin updates"
  on allowed_users for update
  using (is_admin_email(auth.jwt() ->> 'email'))
  with check (is_admin_email(auth.jwt() ->> 'email'));

create policy "admin deletes"
  on allowed_users for delete
  using (is_admin_email(auth.jwt() ->> 'email'));
