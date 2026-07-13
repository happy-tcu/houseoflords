-- v5: case-insensitive email match in RLS policies
-- Google JWTs sometimes return mixed-case emails; DB rows are stored lowercase.

drop policy if exists "self read whitelist" on allowed_users;
create policy "self read whitelist"
  on allowed_users for select
  using (lower(auth.jwt() ->> 'email') = email);
