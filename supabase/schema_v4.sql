-- v4: admin can manage the whitelist

drop policy if exists "admin manages whitelist" on allowed_users;
create policy "admin manages whitelist"
  on allowed_users for all
  using (
    exists (select 1 from allowed_users u
            where u.email = lower(auth.jwt() ->> 'email') and u.role = 'admin')
  )
  with check (
    exists (select 1 from allowed_users u
            where u.email = lower(auth.jwt() ->> 'email') and u.role = 'admin')
  );
