import { supabase } from './supabase'

export const ROUND_STATES = ['locked', 'prep', 'debate', 'voting', 'done']
export const ROUNDS_ALL = ['R1','R2','R3','R4','R5']
export const PRELIM_ROUNDS = ['R1','R2','R3']

export async function fetchRounds() {
  const { data, error } = await supabase.from('rounds').select('*').order('id')
  if (error) throw error
  return data
}

export async function fetchPairings(roundId) {
  const { data, error } = await supabase
    .from('pairings')
    .select('*')
    .eq('round_id', roundId)
    .order('room', { ascending: true })
  if (error) throw error
  return data
}

export async function fetchMotions(roundId) {
  const { data, error } = await supabase
    .from('motions')
    .select('*')
    .eq('round_id', roundId)
  if (error) throw error
  return data
}

export async function fetchBallots(roundId) {
  const { data, error } = await supabase
    .from('ballots')
    .select('*')
    .eq('round_id', roundId)
    .order('room', { ascending: true })
  if (error) throw error
  return data
}

export async function setRoundState(roundId, state) {
  const patch = { state }
  if (state === 'prep')  patch.started_at = new Date().toISOString()
  if (state === 'done')  patch.ends_at    = new Date().toISOString()
  const { error } = await supabase.from('rounds').update(patch).eq('id', roundId)
  if (error) throw error
}

export async function submitBallot(ballot) {
  const { error } = await supabase.from('ballots').insert(ballot)
  if (error) throw error
}

export function totalOf(b, side) {
  return (b[`${side}_argument`] ?? 0) + (b[`${side}_rebuttal`] ?? 0) +
         (b[`${side}_delivery`] ?? 0) + (b[`${side}_persuasion`] ?? 0)
}
