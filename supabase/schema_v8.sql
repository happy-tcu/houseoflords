-- v8: reset_round RPC — wipes everything about a round back to a fresh state

create or replace function reset_round(p_round text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_email(auth.jwt() ->> 'email') then
    raise exception 'admin only';
  end if;

  -- ballots for this round
  delete from ballots where round_id = p_round;

  -- pairings: clear timer, strikes, final motion
  update pairings
  set segment          = 'idle',
      segment_ends_at  = null,
      struck_motion_ids = '{}'::uuid[],
      strike_turn      = 'opp',
      final_motion_id  = null
  where round_id = p_round;

  -- motions for this round
  delete from motions where round_id = p_round;

  -- round row
  update rounds
  set state       = 'locked',
      motion_id   = null,
      started_at  = null,
      ends_at     = null
  where id = p_round;
end $$;

grant execute on function reset_round(text) to authenticated;
