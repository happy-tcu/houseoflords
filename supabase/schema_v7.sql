-- v7: prevent admins from demoting or deleting their own account

create or replace function protect_admin_self()
returns trigger
language plpgsql
as $$
declare
  v_caller text;
begin
  v_caller := lower(auth.jwt() ->> 'email');

  if tg_op = 'DELETE' then
    if lower(old.email) = v_caller and old.role = 'admin' then
      raise exception 'Admins cannot delete their own account';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if lower(old.email) = v_caller and old.role = 'admin' and new.role <> 'admin' then
      raise exception 'Admins cannot demote themselves';
    end if;
    return new;
  end if;

  return null;
end $$;

drop trigger if exists trg_protect_admin_self on allowed_users;
create trigger trg_protect_admin_self
  before update or delete on allowed_users
  for each row execute function protect_admin_self();
