// Timer sequence for a single 59-min IPDA round.
// Judge advances between segments. Debater sees the same values via Realtime.

export const SEGMENTS = [
  { key: 'idle',        label: 'Waiting to start',      seconds: 0,    kind: 'idle',  next: 'prep' },
  { key: 'prep',        label: 'Motion release + prep', seconds: 1800, kind: 'prep',  next: 'prop_const' },
  { key: 'prop_const',  label: 'Prop constructive',     seconds: 300,  kind: 'prop',  next: 'cx_opp_asks' },
  { key: 'cx_opp_asks', label: 'CX — Opp asks Prop',    seconds: 120,  kind: 'cx',    next: 'opp_open' },
  { key: 'opp_open',    label: 'Opp opening',           seconds: 360,  kind: 'opp',   next: 'cx_prop_asks' },
  { key: 'cx_prop_asks',label: 'CX — Prop asks Opp',    seconds: 120,  kind: 'cx',    next: 'prop_rebut' },
  { key: 'prop_rebut',  label: 'Prop rebuttal',         seconds: 180,  kind: 'prop',  next: 'opp_close' },
  { key: 'opp_close',   label: 'Opp closing',           seconds: 300,  kind: 'opp',   next: 'prop_close' },
  { key: 'prop_close',  label: 'Prop closing',          seconds: 180,  kind: 'prop',  next: 'voting' },
  { key: 'voting',      label: 'Judge voting',          seconds: 180,  kind: 'vote',  next: 'done' },
  { key: 'done',        label: 'Round complete',        seconds: 0,    kind: 'done',  next: null },
]

export const SEGMENT_MAP = Object.fromEntries(SEGMENTS.map(s => [s.key, s]))

export function fmt(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '--:--'
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
}

export function computeRemaining(segment_ends_at, nowMs = Date.now()) {
  if (!segment_ends_at) return null
  const end = new Date(segment_ends_at).getTime()
  return Math.max(0, Math.floor((end - nowMs) / 1000))
}

export function warningLevel(remaining) {
  if (remaining == null) return null
  if (remaining <= 0)    return 'stop'
  if (remaining <= 15)   return 'w15'
  if (remaining <= 30)   return 'w30'
  return null
}
