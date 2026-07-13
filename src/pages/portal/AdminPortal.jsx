import { useEffect, useMemo, useState } from 'react'
import PortalShell from '../../components/PortalShell'
import { supabase } from '../../lib/supabase'
import { useRealtime, useTick } from '../../lib/realtime'
import { useAuth } from '../../lib/auth'
import { ROUNDS as MOTION_ROUNDS } from '../../data/motions'
import { SEGMENT_MAP, fmt, computeRemaining } from '../../lib/segments'

const ROUND_STATES = ['locked', 'prep', 'debate', 'voting', 'done']

export default function AdminPortal() {
  const { rows: rounds } = useRealtime('rounds', {}, [])
  const { rows: pairings } = useRealtime('pairings', {}, [])
  const { rows: motions } = useRealtime('motions', {}, [])
  const { rows: ballots } = useRealtime('ballots', {}, [])
  const { rows: announcements } = useRealtime('announcements',
    { order: { column: 'created_at', ascending: false } }, [])

  const [msg, setMsg] = useState(null)
  const [tab, setTab] = useState('rounds') // rounds | motions | ballots | standings | broadcast | whitelist

  const pairingsByRound = useMemo(() => group(pairings || [], p => p.round_id), [pairings])
  const motionsByRound  = useMemo(() => group(motions  || [], m => m.round_id), [motions])
  const ballotsByRound  = useMemo(() => group(ballots  || [], b => b.round_id), [ballots])

  const totalBallots = (ballots || []).length
  const expectedBallots = 3 * 30
  const active = (rounds || []).find(r => r.state !== 'locked' && r.state !== 'done')

  return (
    <PortalShell title="Admin">
      {msg && <div className="portal-msg">{msg}</div>}

      <div className="portal-stat-row">
        <Stat k="Ballots in" v={<>{totalBallots}<small> / {expectedBallots}</small></>} />
        <Stat k="Active round" v={active?.id || '—'} small={active?.state} />
        <Stat k="Rounds w/ pairings" v={<>{Object.keys(pairingsByRound).length}<small> / 5</small></>} />
        <Stat k="Rounds w/ motion set" v={<>{(rounds || []).filter(r => r.motion_id).length}<small> / 5</small></>} />
      </div>

      <div className="admin-tabs">
        {[
          ['rounds',   'Round Control'],
          ['live',     'Live Rooms'],
          ['motions',  'Motion Picker'],
          ['ballots',  'Ballot Tracker'],
          ['standings','Standings'],
          ['broadcast','Announcements'],
          ['whitelist','Roster'],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'rounds' && <RoundsTab rounds={rounds || []} pairingsByRound={pairingsByRound}
                                     motionsByRound={motionsByRound} ballotsByRound={ballotsByRound}
                                     onMsg={setMsg} />}
      {tab === 'live' && <LiveRoomsTab rounds={rounds || []} pairings={pairings || []} motions={motions || []} ballots={ballots || []} />}
      {tab === 'motions' && <MotionsTab rounds={rounds || []} motionsByRound={motionsByRound} onMsg={setMsg} />}
      {tab === 'ballots' && <BallotsTab rounds={rounds || []} pairingsByRound={pairingsByRound}
                                       ballotsByRound={ballotsByRound} />}
      {tab === 'standings' && <StandingsTab pairings={pairings || []} ballots={ballots || []} />}
      {tab === 'broadcast' && <BroadcastTab announcements={announcements || []} onMsg={setMsg} />}
      {tab === 'whitelist' && <WhitelistTab onMsg={setMsg} />}
    </PortalShell>
  )
}

function Stat({ k, v, small }) {
  return (
    <div className="stat"><div className="k">{k}</div>
      <div className="v">{v}{small && <small> · {small}</small>}</div>
    </div>
  )
}

function group(arr, keyFn) {
  const out = {}
  for (const x of arr) { (out[keyFn(x)] ||= []).push(x) }
  return out
}

/* ---------------- ROUNDS ---------------- */
function RoundsTab({ rounds, pairingsByRound, motionsByRound, ballotsByRound, onMsg }) {
  async function setState(rid, state) {
    onMsg(null)
    const patch = { state }
    if (state === 'prep')  patch.started_at = new Date().toISOString()
    if (state === 'done')  patch.ends_at    = new Date().toISOString()
    const { error } = await supabase.from('rounds').update(patch).eq('id', rid)
    if (error) onMsg(error.message); else onMsg(`${rid} → ${state}`)
  }
  async function resetRound(rid) {
    if (!confirm(`Reset ${rid}?\n\nThis wipes ALL ballots, timer state, strikes, and motions for ${rid}. Pairings stay.`)) return
    onMsg(null)
    const { error } = await supabase.rpc('reset_round', { p_round: rid })
    if (error) onMsg(error.message); else onMsg(`${rid} reset — clean slate.`)
  }
  async function seedMotionsFor(rid) {
    onMsg(null)
    const src = MOTION_ROUNDS.find(r => r.code === rid)
    if (!src) return onMsg(`No motion data for ${rid}`)
    const rows = src.motions.map(m => ({ round_id: rid, kind: m.kind, text: m.text }))
    const { error } = await supabase.from('motions').insert(rows)
    if (error) onMsg(error.message); else onMsg(`Seeded ${rows.length} motions for ${rid}`)
  }
  const ALL = ['R1','R2','R3','R4','R5']
  return (
    <div className="round-controls">
      {ALL.map(rid => {
        const r = rounds.find(x => x.id === rid) || { id: rid, state: 'locked' }
        const b = ballotsByRound[rid]?.length || 0
        const p = pairingsByRound[rid]?.length || 0
        const m = motionsByRound[rid]?.length || 0
        return (
          <div key={rid} className={`rc rc-${r.state}`}>
            <div className="rc-top">
              <span className="rc-code">{rid}</span>
              <span className={`rc-state rc-state-${r.state}`}>{r.state}</span>
            </div>
            <div className="rc-meta">
              <span>Pairings <b>{p}</b></span>
              <span>Motions <b>{m}</b></span>
              <span>Ballots <b>{b}</b></span>
              <span>Motion set <b>{r.motion_id ? '✓' : '—'}</b></span>
            </div>
            <div className="rc-actions">
              {m === 0 && (
                <button className="rc-primary" onClick={() => seedMotionsFor(rid)}>Seed motions</button>
              )}
              {m > 0 && r.state === 'locked' && (
                <button className="rc-primary" onClick={() => setState(rid, 'prep')}>Push motions</button>
              )}
              {r.state !== 'locked' && r.state !== 'done' && (
                <button onClick={() => setState(rid, 'done')}>Mark done</button>
              )}
              <button className="rc-reset" onClick={() => resetRound(rid)}>⟲ Reset</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- LIVE ROOMS ---------------- */
function LiveRoomsTab({ rounds, pairings, motions, ballots }) {
  useTick(500)
  const { rows: drafts } = useRealtime('ballot_drafts', {}, [])
  const [filterR, setFilterR] = useState('all')
  const [q, setQ] = useState('')

  const shownRounds = filterR === 'all' ? rounds : rounds.filter(r => r.id === filterR)

  return (
    <div className="live-rooms">
      <div className="live-controls">
        <div className="live-filter">
          <button className={filterR === 'all' ? 'active' : ''} onClick={() => setFilterR('all')}>All</button>
          {rounds.map(r => (
            <button key={r.id} className={filterR === r.id ? 'active' : ''} onClick={() => setFilterR(r.id)}>{r.id}</button>
          ))}
        </div>
        <input className="live-search" placeholder="Filter by code, room, judge…"
               value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {shownRounds.map(r => {
        const pp = pairings.filter(p => p.round_id === r.id)
          .filter(p => !q || `${p.room} ${p.aff_code} ${p.opp_code} ${p.judge_code}`.toLowerCase().includes(q.toLowerCase()))
        if (pp.length === 0) return null
        const roundMotions = motions.filter(m => m.round_id === r.id)
        return (
          <div key={r.id} className="live-round-block">
            <div className="live-round-hd">
              <span className="rc-code">{r.id}</span>
              <span className={`rc-state rc-state-${r.state}`}>{r.state}</span>
              <span className="live-round-count">{pp.length} rooms</span>
            </div>
            <div className="live-grid">
              {pp.sort((a,b) => a.room - b.room).map(p => (
                <RoomCard key={p.id} pairing={p} roundMotions={roundMotions}
                          ballot={ballots.find(b => b.round_id === r.id && b.room === p.room)}
                          hasDraft={(drafts || []).some(d => d.round_id === r.id && d.room === p.room)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RoomCard({ pairing, roundMotions, ballot, hasDraft, allJudges }) {
  const seg = SEGMENT_MAP[pairing.segment] || SEGMENT_MAP.idle
  const remaining = computeRemaining(pairing.segment_ends_at)
  const finalMotion = roundMotions.find(m => m.id === pairing.final_motion_id)
  const strikes = (pairing.struck_motion_ids || []).length
  const totalMotions = roundMotions.length
  const finished = !!ballot
  const walkover = pairing.absent_aff || pairing.absent_opp

  const stage = finished ? 'done'
    : walkover ? 'done'
    : finalMotion ? seg.kind
    : totalMotions === 0 ? 'idle'
    : 'strike'

  const status = finished ? 'Ballot submitted'
    : walkover ? `${pairing.absent_aff ? 'Aff' : 'Opp'} absent — walkover`
    : finalMotion ? seg.label
    : totalMotions === 0 ? 'Waiting for motions'
    : `Striking — ${strikes}/${totalMotions - 1} · ${pairing.strike_turn.toUpperCase()}'s turn`

  async function toggleAbsent(side) {
    const key = side === 'aff' ? 'absent_aff' : 'absent_opp'
    const code = side === 'aff' ? pairing.aff_code : pairing.opp_code
    const willBeAbsent = !pairing[key]
    if (!confirm(`Mark ${code} ${willBeAbsent ? 'ABSENT (walkover)' : 'present'}?`)) return
    await supabase.from('pairings').update({ [key]: willBeAbsent }).eq('id', pairing.id)
  }
  async function reassign() {
    const newJ = prompt(`Reassign judge for Room #${pairing.room} (currently ${pairing.judge_code}). Enter new J-code:`)
    if (!newJ) return
    const { error } = await supabase.rpc('reassign_judge', { p_pairing: pairing.id, p_new_judge: newJ.trim() })
    if (error) alert(error.message)
  }

  return (
    <div className={`rm-card rm-${stage}`}>
      <div className="rm-hdr">
        <span className="rm-num">#{pairing.room}</span>
        <span className="rm-judge" title="Click to reassign" onClick={reassign} style={{cursor:'pointer'}}>{pairing.judge_code}</span>
      </div>
      <div className="rm-teams">
        <span className={`rm-team aff ${pairing.absent_aff ? 'absent' : ''}`}
              title="Click to toggle absent" onClick={() => toggleAbsent('aff')}>{pairing.aff_code}</span>
        <span className="rm-vs">vs</span>
        <span className={`rm-team opp ${pairing.absent_opp ? 'absent' : ''}`}
              title="Click to toggle absent" onClick={() => toggleAbsent('opp')}>{pairing.opp_code}</span>
      </div>
      <div className="rm-status">{status}</div>
      {hasDraft && !finished && <div className="rm-draft">Draft in progress</div>}
      {seg.seconds > 0 && !finished && !walkover && (
        <div className="rm-time">{fmt(remaining)}</div>
      )}
      {finalMotion && (
        <div className="rm-motion" title={finalMotion.text}>
          <span className="tag" style={{background: finalMotion.kind === 'Policy' ? '#1dafec' : finalMotion.kind === 'Value' ? '#efb34a' : '#8cc63e'}}>{finalMotion.kind}</span>
          <span className="rm-motion-text">{finalMotion.text}</span>
        </div>
      )}
    </div>
  )
}

/* ---------------- MOTIONS + STRIKE STATUS ---------------- */
function MotionsTab({ rounds, motionsByRound, onMsg }) {
  const { rows: pairings } = useRealtime('pairings', {}, [])
  const pairsByRound = useMemo(() => group(pairings || [], p => p.round_id), [pairings])

  async function resetAll(rid) {
    if (!confirm(`Reset all strikes for ${rid}?`)) return
    onMsg(null)
    const pp = pairsByRound[rid] || []
    for (const p of pp) {
      await supabase.rpc('reset_strikes', { p_pairing: p.id })
    }
    onMsg(`Reset ${pp.length} rooms in ${rid}`)
  }

  return (
    <div className="motions-picker">
      <div className="portal-hint" style={{background:'#fff', padding:'12px 16px', border:'1px solid var(--border)', borderRadius: 4, marginBottom: 12}}>
        In IPDA impromptu, all 5 motions are offered per round. Opp strikes first, teams alternate, one remains.
        Set the round to <b>prep</b> and striking opens automatically for every room.
      </div>
      {(rounds || []).map(r => {
        const ms = motionsByRound[r.id] || []
        const pp = pairsByRound[r.id] || []
        const doneCount = pp.filter(p => p.final_motion_id).length
        return (
          <div className="mp-block" key={r.id}>
            <div className="mp-head">
              <span className="rc-code">{r.id}</span>
              <span className="mp-status">
                {ms.length === 0 ? 'No motions seeded' :
                 pp.length === 0 ? `${ms.length} motions ready` :
                 `${doneCount} / ${pp.length} rooms finalized`}
              </span>
              {pp.length > 0 && (
                <button className="btn-secondary" onClick={() => resetAll(r.id)}>Reset all strikes</button>
              )}
            </div>
            {ms.length === 0 && (
              <div className="portal-empty"><b>No motions.</b>
                <span>Round Control → Seed motions.</span>
              </div>
            )}
            {ms.map((m, i) => (
              <div key={m.id} className="mp-motion">
                <span className="tag" style={{background: colorFor(m.kind)}}>{m.kind}</span>
                <p><b>M{i+1}.</b> {m.text}</p>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const colorFor = (k) => k === 'Policy' ? '#1dafec' : k === 'Value' ? '#efb34a' : '#8cc63e'

/* ---------------- BALLOTS ---------------- */
function BallotsTab({ rounds, pairingsByRound, ballotsByRound }) {
  const PRELIMS = ['R1','R2','R3']
  return (
    <div className="ballot-matrix">
      <div className="ballot-matrix-legend">
        <span className="mchip in">Submitted</span>
        <span className="mchip pending">Pending</span>
      </div>
      {PRELIMS.map(rid => {
        const pairs = pairingsByRound[rid] || []
        const bals  = ballotsByRound[rid] || []
        const byRoom = new Set(bals.map(b => b.room))
        return (
          <div key={rid} className="bm-round">
            <div className="bm-head">
              <span className="rc-code">{rid}</span>
              <span className="bm-count">{byRoom.size} / {pairs.length}</span>
            </div>
            <div className="bm-grid">
              {pairs.map(p => (
                <div key={p.id} className={`bm-cell ${byRoom.has(p.room) ? 'in' : 'pending'}`}
                     title={`Room #${p.room} · J${p.judge_code} · ${p.aff_code} vs ${p.opp_code}`}>
                  <span className="bm-room">#{p.room}</span>
                  <span className="bm-judge">{p.judge_code}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- STANDINGS ---------------- */
function StandingsTab({ pairings, ballots }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  async function buildBracket() {
    if (!confirm('Build the R4 semi bracket from top 4 prelims? Existing R4/R5 pairings will be replaced.')) return
    setBusy(true); setNote(null)
    const { error } = await supabase.rpc('build_bracket')
    if (error) setNote(`Error: ${error.message}`)
    else setNote('Bracket built — R4 pairings live')
    setBusy(false)
  }
  async function fillFinal() {
    if (!confirm('Fill the R5 final with winners of R4?')) return
    setBusy(true); setNote(null)
    const { error } = await supabase.rpc('fill_final')
    if (error) setNote(`Error: ${error.message}`)
    else setNote('R5 final populated with R4 winners')
    setBusy(false)
  }
  const stats = useMemo(() => {
    const s = {}   // { code: { wins, points, appearances } }
    for (const b of ballots) {
      const pair = pairings.find(p => p.round_id === b.round_id && p.room === b.room)
      if (!pair) continue
      for (const side of ['aff','opp']) {
        const code = side === 'aff' ? pair.aff_code : pair.opp_code
        s[code] ||= { code, wins: 0, points: 0, appearances: 0 }
        s[code].appearances++
        const pts = (b[`${side}_argument`]||0) + (b[`${side}_rebuttal`]||0) + (b[`${side}_delivery`]||0) + (b[`${side}_persuasion`]||0)
        s[code].points += pts
        if (b.winner === side) s[code].wins++
      }
    }
    return Object.values(s).sort((a, b) => b.wins - a.wins || b.points - a.points)
  }, [pairings, ballots])

  return (
    <>
    <div className="bracket-actions">
      {note && <div className="portal-msg">{note}</div>}
      <button className="btn-primary" onClick={buildBracket} disabled={busy || stats.length < 4}>
        Build R4 semi from top 4
      </button>
      <button className="btn-secondary" onClick={fillFinal} disabled={busy}>Fill R5 final</button>
    </div>
    {stats.length === 0 ? (
      <div className="portal-empty"><b>No results yet.</b><span>Standings populate as ballots come in.</span></div>
    ) : (
    <div className="standings">
      <table className="fmt-table">
        <thead><tr><th>#</th><th>Speaker</th><th>Wins</th><th>Total Points</th><th>Debates</th></tr></thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={s.code} className={i < 4 ? 'top-4' : ''}>
              <td className="rank">{i+1}</td>
              <td className="seg">{s.code}</td>
              <td><b>{s.wins}</b></td>
              <td>{s.points}</td>
              <td>{s.appearances}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="portal-hint">Top 4 advance to R4 Semi. Wins → total points as tiebreaker.</div>
    </div>
    )}
    </>
  )
}

/* ---------------- BROADCAST ---------------- */
function BroadcastTab({ announcements, onMsg }) {
  const [body, setBody] = useState('')
  const [kind, setKind] = useState('info')
  const [audience, setAudience] = useState('all')
  const [busy, setBusy] = useState(false)
  async function send(e) {
    e.preventDefault(); setBusy(true); onMsg(null)
    const { error } = await supabase.from('announcements').insert({ body, kind, audience })
    if (error) onMsg(error.message)
    else { setBody(''); onMsg(`Broadcast sent to ${audience}`) }
    setBusy(false)
  }
  return (
    <div className="broadcast">
      <form onSubmit={send} className="ballot-form">
        <label className="note-row"><span>Message</span>
          <textarea rows="3" required value={body} onChange={e => setBody(e.target.value)}
                    placeholder="Round starts in 5 min. Head to your rooms." />
        </label>
        <div className="broadcast-row">
          <select value={kind} onChange={e => setKind(e.target.value)}>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="urgent">Urgent</option>
          </select>
          <select value={audience} onChange={e => setAudience(e.target.value)}>
            <option value="all">Everyone</option>
            <option value="scholars">Scholars only</option>
            <option value="judges">Judges only</option>
            <option value="admins">Admins only</option>
          </select>
          <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </form>

      <h2 className="portal-h2">History</h2>
      <div className="broadcast-list">
        {announcements.length === 0 && <div className="portal-empty"><b>No announcements yet.</b></div>}
        {announcements.map(a => (
          <div key={a.id} className={`ann ann-${a.kind}`}>
            <span className="ann-when">{new Date(a.created_at).toLocaleTimeString()}</span>
            <span className="ann-body">{a.body}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- WHITELIST ---------------- */
const ALL_SCHOLAR_CODES = 'ABCDEF'.split('').flatMap(c => Array.from({length:10}, (_,i) => `${c}${i+1}`))
const ALL_JUDGE_CODES = Array.from({length:30}, (_,i) => `J${i+1}`)

async function sendInviteEmail(u) {
  try {
    const { data, error } = await supabase.functions.invoke('send-invite', {
      body: { email: u.email, role: u.role, code: u.code, name: u.name },
    })
    if (error) return { ok: false, error: error.message }
    if (data?.error) return { ok: false, error: data.error }
    return { ok: true }
  } catch (e) { return { ok: false, error: String(e?.message ?? e) } }
}

function WhitelistTab({ onMsg }) {
  const { profile } = useAuth()
  const myEmail = profile?.email?.toLowerCase()
  const [users, setUsers] = useState([])
  const [busy, setBusy] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [bulk, setBulk] = useState('')

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('scholar')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  const [editing, setEditing] = useState(null)  // email
  const [er, setER] = useState('scholar')
  const [ec, setEC] = useState('')
  const [en, setEN] = useState('')

  useEffect(() => {
    load()
    const chan = supabase.channel('roster').on('postgres_changes',
      { event: '*', schema: 'public', table: 'allowed_users' },
      () => load()
    ).subscribe()
    return () => { supabase.removeChannel(chan) }
  }, [])
  async function load() {
    const { data } = await supabase.from('allowed_users').select('*').order('role').order('code')
    setUsers(data || [])
  }

  function statusOf(u) {
    if (u.first_signed_in_at) return { key: 'accepted', label: 'Accepted', at: u.first_signed_in_at }
    if (u.email_opened_at)    return { key: 'opened',   label: 'Opened',   at: u.email_opened_at }
    if (u.invited_at)         return { key: 'invited',  label: 'Invited',  at: u.invited_at }
    return { key: 'never', label: 'Not sent', at: null }
  }

  const takenCodes = new Set(users.map(u => u.code).filter(Boolean))
  const availableCodes = useMemo(() => {
    const pool = role === 'scholar' ? ALL_SCHOLAR_CODES
              : role === 'judge'   ? ALL_JUDGE_CODES : []
    return pool.filter(c => !takenCodes.has(c))
  }, [role, users])

  async function invite(e) {
    e.preventDefault(); setBusy(true); onMsg(null)
    const row = {
      email: email.trim().toLowerCase(),
      role,
      code: role === 'admin' ? null : (code || null),
      name: name.trim() || null,
    }
    if (!row.email) { onMsg('Email required'); setBusy(false); return }
    if (role !== 'admin' && !row.code) { onMsg('Pick a code'); setBusy(false); return }
    const { error } = await supabase.from('allowed_users').upsert([row], { onConflict: 'email' })
    if (error) { onMsg(error.message); setBusy(false); return }

    // Fire-and-forget email invite; success even if email fails.
    const emailResult = await sendInviteEmail(row)
    if (emailResult.ok) onMsg(`Added ${row.email} and sent invite email`)
    else onMsg(`Added ${row.email}. Email failed: ${emailResult.error}`)

    setEmail(''); setCode(''); setName(''); load()
    setBusy(false)
  }

  async function resend(u) {
    onMsg(null)
    const r = await sendInviteEmail(u)
    if (r.ok) onMsg(`Invite email resent to ${u.email}`)
    else onMsg(`Send failed: ${r.error}`)
  }

  async function remove(em) {
    if (!confirm(`Remove ${em}?`)) return
    const { error } = await supabase.from('allowed_users').delete().eq('email', em)
    if (error) onMsg(error.message); else load()
  }

  function startEdit(u) {
    setEditing(u.email); setER(u.role); setEC(u.code || ''); setEN(u.name || '')
  }
  function cancelEdit() { setEditing(null); onMsg(null) }
  async function saveEdit(em) {
    setBusy(true); onMsg(null)
    const patch = {
      role: er,
      code: er === 'admin' ? null : (ec || null),
      name: en.trim() || null,
    }
    if (er !== 'admin' && !patch.code) { onMsg('Pick a code'); setBusy(false); return }
    const { error } = await supabase.from('allowed_users').update(patch).eq('email', em)
    if (error) onMsg(error.message)
    else { onMsg(`Updated ${em}`); setEditing(null); load() }
    setBusy(false)
  }

  function availableForEdit(currentUser, targetRole) {
    if (targetRole === 'admin') return []
    const pool = targetRole === 'scholar' ? ALL_SCHOLAR_CODES : ALL_JUDGE_CODES
    return pool.filter(c => !takenCodes.has(c) || c === currentUser.code)
  }

  async function bulkImport(e) {
    e.preventDefault(); setBusy(true); onMsg(null)
    const rows = bulk.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const [em, r, c, n] = line.split(',').map(s => s?.trim())
      return { email: em?.toLowerCase(), role: r, code: c || null, name: n || null }
    }).filter(r => r.email && r.role)
    if (rows.length === 0) { onMsg('Nothing to import.'); setBusy(false); return }
    const { error } = await supabase.from('allowed_users').upsert(rows, { onConflict: 'email' })
    if (error) onMsg(error.message); else { onMsg(`Imported ${rows.length}`); setBulk(''); load() }
    setBusy(false)
  }

  return (
    <div className="whitelist">
      <form onSubmit={invite} className="invite-card">
        <div className="invite-row">
          <div className="invite-field grow">
            <label>Email</label>
            <input type="email" required value={email}
                   onChange={e => setEmail(e.target.value)}
                   placeholder="name@example.com" />
          </div>
          <div className="invite-field">
            <label>Name (optional)</label>
            <input type="text" value={name}
                   onChange={e => setName(e.target.value)}
                   placeholder="Full name" />
          </div>
        </div>

        <div className="invite-row">
          <div className="invite-field">
            <label>Role</label>
            <div className="role-picker">
              {['scholar','judge','admin'].map(r => (
                <button type="button" key={r}
                        className={`role-btn role-${r} ${role === r ? 'sel' : ''}`}
                        onClick={() => { setRole(r); setCode('') }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {role !== 'admin' && (
            <div className="invite-field grow">
              <label>Code {availableCodes.length ? `(${availableCodes.length} available)` : '(none available)'}</label>
              <select required value={code} onChange={e => setCode(e.target.value)}>
                <option value="">— choose {role} code —</option>
                {availableCodes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="invite-actions">
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Inviting…' : `Invite as ${role}`}
          </button>
          <button type="button" className="btn-secondary"
                  onClick={() => setShowBulk(v => !v)}>
            {showBulk ? 'Hide bulk import' : 'Bulk import (CSV)'}
          </button>
        </div>
      </form>

      {showBulk && (
        <form onSubmit={bulkImport} className="ballot-form" style={{marginTop: 16}}>
          <label className="note-row">
            <span>One per line: email, role, code, name</span>
            <textarea rows="5" value={bulk} onChange={e => setBulk(e.target.value)}
                      placeholder="alice@school.edu, scholar, A1, Alice K."/>
          </label>
          <button className="btn-primary" disabled={busy}>{busy ? 'Importing…' : 'Import'}</button>
        </form>
      )}

      <h2 className="portal-h2">Current roster ({users.length})</h2>
      <div className="wl-list">
        {users.map(u => {
          const isSelf = u.email.toLowerCase() === myEmail
          const isEditing = editing === u.email
          const editCodes = availableForEdit(u, er)

          if (isEditing) {
            return (
              <div key={u.email} className="wl-row wl-editing">
                <select value={er} onChange={e => { setER(e.target.value); setEC('') }}
                        className={`role-select role-${er}`}
                        disabled={isSelf && u.role === 'admin'}>
                  <option value="scholar">scholar</option>
                  <option value="judge">judge</option>
                  <option value="admin">admin</option>
                </select>
                {er === 'admin'
                  ? <span className="wl-code">—</span>
                  : (
                    <select value={ec} onChange={e => setEC(e.target.value)} required>
                      <option value="">— code —</option>
                      {editCodes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                <input className="wl-name-input" value={en} onChange={e => setEN(e.target.value)}
                       placeholder="Name" />
                <span className="wl-email">{u.email}</span>
                <div className="wl-edit-actions">
                  <button className="wl-save" onClick={() => saveEdit(u.email)} disabled={busy}>Save</button>
                  <button className="wl-cancel" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            )
          }

          return (
            <div key={u.email} className={`wl-row ${isSelf ? 'wl-self' : ''}`}>
              <span className={`role-tag role-${u.role}`}>{u.role}</span>
              <span className="wl-code">{u.code || '—'}</span>
              <span className="wl-name">{u.name || '—'}{isSelf && <span className="wl-you">you</span>}</span>
              <span className="wl-email">{u.email}</span>
              <div className="wl-row-actions">
                <button className="wl-edit-btn" onClick={() => resend(u)} title="Resend invite email">✉</button>
                <button className="wl-edit-btn" onClick={() => startEdit(u)}>Edit</button>
                {isSelf
                  ? <span className="wl-locked" title="You can't remove your own admin">🔒</span>
                  : <button className="wl-del" onClick={() => remove(u.email)}>×</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
