-- v23: forfeit / no-show admin RPC.
-- Inserts a ballot on behalf of a pairing where one side did not appear.
-- Non-forfeit side gets 3s across the board (13/20), forfeit side gets zeros.
-- Round can then be closed like any normal room.

create or replace function mark_forfeit(
  p_pairing_id uuid,
  p_forfeit_side text            -- 'aff' | 'opp'
) returns ballots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
  v_pair pairings%rowtype;
  v_row ballots%rowtype;
begin
  v_admin_email := lower(auth.jwt() ->> 'email');
  if not is_admin_email(v_admin_email) then raise exception 'admin only'; end if;

  if p_forfeit_side not in ('aff', 'opp') then
    raise exception 'p_forfeit_side must be aff or opp';
  end if;

  select * into v_pair from pairings where id = p_pairing_id;
  if not found then raise exception 'pairing not found'; end if;

  insert into ballots (round_id, room, judge_code,
                      aff_code, opp_code,
                      aff_argument, aff_rebuttal, aff_delivery, aff_persuasion,
                      opp_argument, opp_rebuttal, opp_delivery, opp_persuasion,
                      winner)
  values (v_pair.round_id, v_pair.room, coalesce(v_pair.judge_code, 'ADMIN-FORFEIT'),
          v_pair.aff_code, v_pair.opp_code,
          case when p_forfeit_side = 'aff' then 0 else 3 end,
          case when p_forfeit_side = 'aff' then 0 else 3 end,
          case when p_forfeit_side = 'aff' then 0 else 3 end,
          case when p_forfeit_side = 'aff' then 0 else 4 end,   -- 13/20 for the winner
          case when p_forfeit_side = 'opp' then 0 else 3 end,
          case when p_forfeit_side = 'opp' then 0 else 3 end,
          case when p_forfeit_side = 'opp' then 0 else 3 end,
          case when p_forfeit_side = 'opp' then 0 else 4 end,
          case when p_forfeit_side = 'aff' then 'opp'::winner_t else 'aff'::winner_t end)
  on conflict (round_id, room) do update
    set aff_argument = excluded.aff_argument,
        aff_rebuttal = excluded.aff_rebuttal,
        aff_delivery = excluded.aff_delivery,
        aff_persuasion = excluded.aff_persuasion,
        opp_argument = excluded.opp_argument,
        opp_rebuttal = excluded.opp_rebuttal,
        opp_delivery = excluded.opp_delivery,
        opp_persuasion = excluded.opp_persuasion,
        winner = excluded.winner,
        judge_code = excluded.judge_code,
        submitted_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function mark_forfeit(uuid, text) to authenticated;
