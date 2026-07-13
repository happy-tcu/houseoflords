import { useEffect, useMemo, useState } from 'react'
import PortalShell from '../../components/PortalShell'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/realtime'
import { ROUNDS as MOTION_ROUNDS } from '../../data/motions'

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
          ['rounds', 'Round Control'],
          ['motions', 'Motion Picker'],
          ['ballots', 'Ballot Tracker'],
          ['standings', 'Standings'],
          ['broadcast', 'Announcements'],
          ['whitelist', 'Roster'],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'rounds' && <RoundsTab rounds={rounds || []} pairingsByRound={pairingsByRound}
                                     motionsByRound={motionsByRound} ballotsByRound={ballotsByRound}
                                     onMsg={setMsg} />}
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
              {m === 0 && <button onClick={() => seedMotionsFor(rid)}>Seed motions</button>}
              {ROUND_STATES.map(st => st !== r.state && (
                <button key={st} onClick={() => setState(rid, st)}>→ {st}</button>
              ))}
            </div>
          </div>
        )
      })}
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

  if (stats.length === 0) return <div className="portal-empty"><b>No results yet.</b><span>Standings populate as ballots come in.</span></div>

  return (
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
  )
}

/* ---------------- BROADCAST ---------------- */
function BroadcastTab({ announcements, onMsg }) {
  const [body, setBody] = useState('')
  const [kind, setKind] = useState('info')
  const [busy, setBusy] = useState(false)
  async function send(e) {
    e.preventDefault(); setBusy(true); onMsg(null)
    const { error } = await supabase.from('announcements').insert({ body, kind })
    if (error) onMsg(error.message)
    else { setBody(''); onMsg('Broadcast sent') }
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
function WhitelistTab({ onMsg }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [users, setUsers] = useState([])

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('allowed_users').select('*').order('role').order('code')
    setUsers(data || [])
  }

  async function bulkImport(e) {
    e.preventDefault(); setBusy(true); onMsg(null)
    const rows = text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const [email, role, code, name] = line.split(',').map(s => s?.trim())
      return { email: email?.toLowerCase(), role, code: code || null, name: name || null }
    }).filter(r => r.email && r.role)
    if (rows.length === 0) { onMsg('Nothing to import.'); setBusy(false); return }
    const { error } = await supabase.from('allowed_users').upsert(rows, { onConflict: 'email' })
    if (error) onMsg(error.message); else { onMsg(`Imported ${rows.length} rows`); setText(''); load() }
    setBusy(false)
  }

  async function remove(email) {
    if (!confirm(`Remove ${email}?`)) return
    const { error } = await supabase.from('allowed_users').delete().eq('email', email)
    if (error) onMsg(error.message); else load()
  }

  return (
    <div className="whitelist">
      <form onSubmit={bulkImport} className="ballot-form">
        <label className="note-row"><span>Bulk import (one per line: email, role, code, name)</span>
          <textarea rows="6" value={text} onChange={e => setText(e.target.value)}
                    placeholder="alice@school.edu, scholar, A1, Alice K.&#10;bob@school.edu, judge, J5, Dr. Bob&#10;organizer@isomo.org, admin, ,Isomo Ops"/>
        </label>
        <button className="btn-primary" disabled={busy}>{busy ? 'Importing…' : 'Import / Upsert'}</button>
      </form>

      <h2 className="portal-h2">Current roster ({users.length})</h2>
      <div className="wl-list">
        {users.map(u => (
          <div key={u.email} className="wl-row">
            <span className={`role-tag role-${u.role}`}>{u.role}</span>
            <span className="wl-code">{u.code || '—'}</span>
            <span className="wl-name">{u.name || '—'}</span>
            <span className="wl-email">{u.email}</span>
            <button className="wl-del" onClick={() => remove(u.email)}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
