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
  const [tab, setTab] = useState('now')

  const pairingsByRound = useMemo(() => group(pairings || [], p => p.round_id), [pairings])
  const motionsByRound  = useMemo(() => group(motions  || [], m => m.round_id), [motions])
  const ballotsByRound  = useMemo(() => group(ballots  || [], b => b.round_id), [ballots])

  const totalBallots = (ballots || []).length
  const expectedBallots = 3 * 30
  const active = (rounds || []).find(r => r.state !== 'locked' && r.state !== 'done')

  const allDone = rounds && rounds.length === 5 && rounds.every(r => r.state === 'done')

  return (
    <PortalShell title="Admin">
      {msg && <div className="portal-msg">{msg}</div>}
      {allDone && (
        <div className="tournament-done">
          <div className="td-emoji">🏆</div>
          <div>
            <b>Tournament complete.</b>
            <span>All five rounds sealed. Check Standings for the final winner.</span>
          </div>
        </div>
      )}

      <div className="portal-stat-row">
        <Stat k="Ballots in" v={<>{totalBallots}<small> / {expectedBallots}</small></>} />
        <Stat k="Active round" v={active?.id || '—'} small={active?.state} />
        <Stat k="Rounds w/ pairings" v={<>{Object.keys(pairingsByRound).length}<small> / 5</small></>} />
        <Stat k="Rounds w/ motion set" v={<>{(rounds || []).filter(r => r.motion_id).length}<small> / 5</small></>} />
      </div>

      <div className="admin-tabs">
        {[
          ['now',     'Now'],
          ['rounds',  'Round Control'],
          ['live',    'Live Rooms'],
          ['motions', 'Round Motions'],
          ['ballots', 'Ballot Tracker'],
          ['feedback','Feedback Preview'],
          ['stats',   'Tournament Stats'],
          ['standings','Standings'],
          ['broadcast','Announcements'],
          ['certs',   'Certificates'],
          ['regs',    'Teams'],
          ['judgeregs','Judges'],
          ['whitelist','Roster'],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'now'    && <NowTab rounds={rounds || []} pairings={pairings || []} ballots={ballots || []} />}
      {tab === 'rounds' && <RoundsTab rounds={rounds || []} pairingsByRound={pairingsByRound}
                                     motionsByRound={motionsByRound} ballotsByRound={ballotsByRound}
                                     onMsg={setMsg} />}
      {tab === 'live' && <LiveRoomsTab rounds={rounds || []} pairings={pairings || []} motions={motions || []} ballots={ballots || []} />}
      {tab === 'motions' && <MotionsTab rounds={rounds || []} motionsByRound={motionsByRound} onMsg={setMsg} />}
      {tab === 'ballots' && <BallotsTab rounds={rounds || []} pairingsByRound={pairingsByRound}
                                       ballotsByRound={ballotsByRound} />}
      {tab === 'feedback' && <FeedbackPreviewTab pairings={pairings || []} ballots={ballots || []}
                                                  rounds={rounds || []} motions={motions || []} />}
      {tab === 'stats'    && <StatsTab pairings={pairings || []} ballots={ballots || []}
                                        rounds={rounds || []} motions={motions || []} />}
      {tab === 'standings' && <StandingsTab pairings={pairings || []} ballots={ballots || []} />}
      {tab === 'broadcast' && <BroadcastTab announcements={announcements || []} onMsg={setMsg} />}
      {tab === 'certs'     && <CertificatesTab onMsg={setMsg} />}
      {tab === 'regs'      && <RegistrationsTab onMsg={setMsg} />}
      {tab === 'judgeregs' && <JudgeRegistrationsTab onMsg={setMsg} />}
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
  const ALL = ['R0','R1','R2','R3','R4','R5']
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

/* ---------------- NOW (exception feed) ---------------- */
function NowTab({ rounds, pairings, ballots }) {
  useTick(1000)
  const active = rounds.find(r => r.state !== 'locked' && r.state !== 'done')
  const now = Date.now()
  const { rows: settings } = useRealtime('app_settings', {}, [])
  const feedbackVisible = useMemo(() => {
    const s = (settings || []).find(x => x.key === 'feedback_visible')
    return s?.value === true
  }, [settings])
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  async function toggleFeedback() {
    setFeedbackBusy(true)
    const next = !feedbackVisible
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'feedback_visible', value: next, updated_at: new Date().toISOString() },
              { onConflict: 'key' })
    setFeedbackBusy(false)
    if (error) alert(`Error: ${error.message}`)
  }

  const exceptions = useMemo(() => {
    const items = []
    for (const p of pairings) {
      const r = rounds.find(x => x.id === p.round_id)
      if (!r) continue
      const submitted = ballots.some(b => b.round_id === p.round_id && p.room === b.room)

      // 1. Timer expired > 60s and still not submitted
      if (p.segment && p.segment !== 'idle' && p.segment !== 'done' && p.segment_ends_at) {
        const ends = new Date(p.segment_ends_at).getTime()
        const over = Math.floor((now - ends) / 1000)
        if (over > 60 && !submitted) {
          items.push({ severity: 'red', code: `R${r.id.slice(1)}-${p.room}`,
            room: p.room, round: p.round_id, judge: p.judge_code,
            headline: `${p.segment} overdue by ${Math.floor(over/60)}m`,
            detail: `${p.aff_code} vs ${p.opp_code}, judge ${p.judge_code}`,
          })
        }
      }
      // 2. Walkover flagged
      if (p.absent_aff || p.absent_opp) {
        items.push({ severity: 'amber', code: `WO-${p.room}`,
          room: p.room, round: p.round_id, judge: p.judge_code,
          headline: `${p.absent_aff ? p.aff_code : p.opp_code} absent — walkover`,
          detail: `${r.id} Room #${p.room}`,
        })
      }
      // 3. Round is done (state) but this room has no ballot
      if (r.state === 'done' && !submitted && !(p.absent_aff || p.absent_opp)) {
        items.push({ severity: 'red', code: `MISS-${p.room}`,
          room: p.room, round: p.round_id, judge: p.judge_code,
          headline: `Ballot missing after ${r.id} closed`,
          detail: `Judge ${p.judge_code} · ${p.aff_code} vs ${p.opp_code}`,
        })
      }
    }
    // sort: red first, then amber; then by round & room
    const order = { red: 0, amber: 1 }
    return items.sort((a, b) => order[a.severity] - order[b.severity] || (a.round + a.room).localeCompare(b.round + b.room))
  }, [pairings, ballots, rounds, now])

  return (
    <div className="now-tab">
      <div className="now-hd">
        <div className="now-hd-block">
          <div className="k">Active</div>
          <div className="v">{active ? `${active.id} · ${active.state}` : 'None'}</div>
        </div>
        <div className="now-hd-block">
          <div className="k">Ballots in</div>
          <div className="v">{ballots.length}<small> / 90</small></div>
        </div>
        <div className={`now-hd-block ${exceptions.filter(x => x.severity==='red').length ? 'urgent' : ''}`}>
          <div className="k">Attention</div>
          <div className="v">{exceptions.length}</div>
        </div>
      </div>

      <div className={`feedback-toggle ${feedbackVisible ? 'live' : ''}`}>
        <div>
          <span className="k">Debater feedback</span>
          <div className="v">{feedbackVisible ? 'Released — every debater sees scores + notes' : 'Locked — hidden from debaters until you release'}</div>
        </div>
        <button className={`btn-${feedbackVisible ? 'danger' : 'primary'}`}
                onClick={toggleFeedback} disabled={feedbackBusy}>
          {feedbackBusy ? '…' : feedbackVisible ? 'Lock feedback' : 'Release feedback'}
        </button>
      </div>

      {exceptions.length === 0 ? (
        <div className="portal-empty ok">
          <b>✓ All rooms nominal.</b>
          <span>No overdue timers, missing ballots, or absent scholars.</span>
        </div>
      ) : (
        <div className="now-list">
          {exceptions.map((x, i) => (
            <div key={i} className={`now-item sev-${x.severity}`}>
              <span className="ni-code">{x.code}</span>
              <div className="ni-body">
                <div className="ni-headline">{x.headline}</div>
                <div className="ni-detail">{x.detail}</div>
              </div>
              <span className="ni-badge">{x.round} · Room #{x.room}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- LIVE ROOMS ---------------- */
function LiveRoomsTab({ rounds, pairings, motions, ballots }) {
  useTick(500)
  const { rows: drafts } = useRealtime('ballot_drafts', {}, [])
  const { rows: semiVotes } = useRealtime('semi_votes', {}, [])
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
                          hasDraft={(drafts || []).some(d => d.round_id === r.id && d.room === p.room)}
                          semiVotes={(semiVotes || []).filter(v => v.round_id === r.id && v.room === p.room)}
                          isSemi={r.id === 'R4' || r.id === 'R5'} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RoomCard({ pairing, roundMotions, ballot, hasDraft, allJudges, semiVotes = [], isSemi = false }) {
  const { rows: semiPanels } = useRealtime('semi_panels', {}, [])
  const { rows: allowed } = useRealtime('allowed_users', {}, [])
  const isFinal = pairing.round_id === 'R5'
  const panelForRoom = isSemi
    ? (isFinal ? 'F' : (pairing.room === 1 ? 'A' : 'B'))
    : null
  // For final: all judges are on one panel of 30.
  const panelJudges = isSemi
    ? (isFinal
        ? (allowed || []).filter(u => u.role === 'judge').map(u => ({ judge_code: u.code, panel: 'F', location: 'Amphitheatre' }))
        : (semiPanels || []).filter(p => p.panel === panelForRoom))
    : []
  const panelSize = isFinal ? 30 : 15
  const majority = isFinal ? 16 : 8
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
  async function recordForfeit(side) {
    const winner = side === 'aff' ? pairing.opp_code : pairing.aff_code
    const loser  = side === 'aff' ? pairing.aff_code : pairing.opp_code
    if (!confirm(`Record forfeit ballot for Room #${pairing.room}?\n\n${loser} = 0/20 (forfeit)\n${winner} = 13/20 (walkover)\nWinner: ${winner}\n\nThis writes a ballot so the round can close.`)) return
    const { error } = await supabase.rpc('mark_forfeit', { p_pairing_id: pairing.id, p_forfeit_side: side })
    if (error) alert(error.message)
  }

  return (
    <div className={`rm-card rm-${stage}`}>
      <div className="rm-hdr">
        <span className="rm-num">#{pairing.room}</span>
        {isSemi ? (
          <span className="rm-panel-tag" title={`${isFinal ? 'Final' : 'Panel ' + panelForRoom} · ${isFinal ? 'Amphitheatre' : 'Commons ' + panelForRoom} · ${panelJudges.length} judges`}>
            {isFinal ? `Final · ${panelJudges.length}` : `Panel ${panelForRoom} · ${panelJudges.length}`}
          </span>
        ) : (
          <span className="rm-judge" title="Click to reassign" onClick={reassign} style={{cursor:'pointer'}}>{pairing.judge_code}</span>
        )}
      </div>
      {isSemi && panelJudges.length > 0 && (
        <details className="rm-panel-roster">
          <summary>View all {panelJudges.length} judges</summary>
          <div className="rm-panel-list">
            {panelJudges.sort((a, b) => (parseInt(a.judge_code.replace(/^J/, ''),10) || 0) - (parseInt(b.judge_code.replace(/^J/, ''),10) || 0)).map(j => {
              const voted = semiVotes.find(v => v.judge_code === j.judge_code)
              return (
                <span key={j.judge_code} className={`rm-panel-chip ${voted ? `voted-${voted.vote}` : ''}`}>
                  {j.judge_code}
                </span>
              )
            })}
          </div>
        </details>
      )}
      <div className="rm-teams">
        <span className={`rm-team aff ${pairing.absent_aff ? 'absent' : ''}`}
              title="Click to toggle absent" onClick={() => toggleAbsent('aff')}>{pairing.aff_code}</span>
        <span className="rm-vs">vs</span>
        <span className={`rm-team opp ${pairing.absent_opp ? 'absent' : ''}`}
              title="Click to toggle absent" onClick={() => toggleAbsent('opp')}>{pairing.opp_code}</span>
      </div>
      <div className="rm-status">{status}</div>
      {finished && ballot?.forfeit_side && (
        <div className="rm-forfeit-chip">
          {ballot.forfeit_side === 'aff' ? `${pairing.aff_code} forfeit` : `${pairing.opp_code} forfeit`}
        </div>
      )}
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
      {!finished && (pairing.absent_aff || pairing.absent_opp) && (
        <button className="rm-forfeit" onClick={() => recordForfeit(pairing.absent_aff ? 'aff' : 'opp')}>
          Record forfeit ballot →
        </button>
      )}
      {isSemi && (() => {
        const affN = semiVotes.filter(v => v.vote === 'aff').length
        const oppN = semiVotes.filter(v => v.vote === 'opp').length
        const total = affN + oppN
        const decided = affN >= majority || oppN >= majority
        const winner = affN > oppN ? 'aff' : oppN > affN ? 'opp' : null
        return (
          <div className="rm-semi-tally">
            <div className="rm-semi-row">
              <span className="rm-semi-label">Prop {pairing.aff_code}</span>
              <span className="rm-semi-bar"><span className="fill aff" style={{ width: `${(affN/panelSize)*100}%` }} /></span>
              <span className="rm-semi-count">{affN}</span>
            </div>
            <div className="rm-semi-row">
              <span className="rm-semi-label">Opp {pairing.opp_code}</span>
              <span className="rm-semi-bar"><span className="fill opp" style={{ width: `${(oppN/panelSize)*100}%` }} /></span>
              <span className="rm-semi-count">{oppN}</span>
            </div>
            <div className="rm-semi-foot">
              {total}/{panelSize} votes
              {decided && winner && <b className="rm-semi-winner"> · Winner: {winner === 'aff' ? pairing.aff_code : pairing.opp_code}</b>}
            </div>
          </div>
        )
      })()}
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
  const { rows: semiVotes } = useRealtime('semi_votes', {}, [])
  const { rows: allowed } = useRealtime('allowed_users', {}, [])
  const { rows: semiPanels } = useRealtime('semi_panels', {}, [])

  const allJudges = useMemo(() => (allowed || []).filter(u => u.role === 'judge'), [allowed])
  const panelForRoom = { 1: 'A', 2: 'B' }

  // For each judge, list the R4 + R5 rooms they vote on.
  function judgesForR4Room(room) {
    return (semiPanels || []).filter(p => p.panel === panelForRoom[room]).map(p => p.judge_code)
  }
  const finalPanelCodes = allJudges.map(j => j.code)

  return (
    <div className="ballot-matrix">
      <div className="ballot-matrix-legend">
        <span className="mchip in">Submitted</span>
        <span className="mchip pending">Pending</span>
      </div>

      {/* Prelims — 1 ballot per room */}
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
                     title={`Room #${p.room} · ${p.judge_code} · ${p.aff_code} vs ${p.opp_code}`}>
                  <span className="bm-room">#{p.room}</span>
                  <span className="bm-judge">{p.judge_code}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* R4 semis — one cell per judge per panel room */}
      {['R4'].map(rid => {
        const pairs = pairingsByRound[rid] || []
        if (pairs.length === 0) return null
        return (
          <div key={rid} className="bm-round">
            <div className="bm-head">
              <span className="rc-code">{rid} (Semis)</span>
              <span className="bm-count">
                {(semiVotes || []).filter(v => v.round_id === rid).length} / {pairs.reduce((sum, p) => sum + judgesForR4Room(p.room).length, 0)}
              </span>
            </div>
            {pairs.map(p => {
              const codes = judgesForR4Room(p.room)
              const voted = new Set((semiVotes || []).filter(v => v.round_id === rid && v.room === p.room).map(v => v.judge_code))
              return (
                <div key={p.id} className="bm-semi-block">
                  <div className="bm-semi-hd">
                    Room #{p.room} · Panel {panelForRoom[p.room]} · {p.aff_code} vs {p.opp_code}
                    <span className="bm-count">{voted.size} / {codes.length}</span>
                  </div>
                  <div className="bm-grid bm-grid-tight">
                    {codes.sort((a, b) => (parseInt(a.replace(/^J/, ''), 10) || 0) - (parseInt(b.replace(/^J/, ''), 10) || 0)).map(c => (
                      <div key={c} className={`bm-cell tight ${voted.has(c) ? 'in' : 'pending'}`}
                           title={`${c} · ${voted.has(c) ? 'voted' : 'not yet'}`}>
                        <span className="bm-judge">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* R5 final — one cell per judge */}
      {['R5'].map(rid => {
        const pairs = pairingsByRound[rid] || []
        if (pairs.length === 0) return null
        const p = pairs[0]
        const voted = new Set((semiVotes || []).filter(v => v.round_id === rid && v.room === 1).map(v => v.judge_code))
        return (
          <div key={rid} className="bm-round">
            <div className="bm-head">
              <span className="rc-code">{rid} (Final)</span>
              <span className="bm-count">{voted.size} / {finalPanelCodes.length}</span>
            </div>
            <div className="bm-semi-block">
              <div className="bm-semi-hd">
                Room #1 · Amphitheatre · {p.aff_code} vs {p.opp_code}
                <span className="bm-count">{voted.size} / {finalPanelCodes.length}</span>
              </div>
              <div className="bm-grid bm-grid-tight">
                {finalPanelCodes.sort((a, b) => (parseInt(a.replace(/^J/, ''), 10) || 0) - (parseInt(b.replace(/^J/, ''), 10) || 0)).map(c => (
                  <div key={c} className={`bm-cell tight ${voted.has(c) ? 'in' : 'pending'}`}
                       title={`${c} · ${voted.has(c) ? 'voted' : 'not yet'}`}>
                    <span className="bm-judge">{c}</span>
                  </div>
                ))}
              </div>
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
  const { rows: semiVotes } = useRealtime('semi_votes', {}, [])
  const { rows: allowed } = useRealtime('allowed_users', {}, [])
  const nameByCode = useMemo(() => {
    const m = {}
    for (const u of (allowed || [])) if (u.code) m[u.code] = u.name || ''
    return m
  }, [allowed])
  async function buildBracket() {
    if (!confirm('Build the R4 quarters bracket from top 4 prelims? Existing R4/R5 pairings will be replaced.')) return
    setBusy(true); setNote(null)
    const { error } = await supabase.rpc('build_bracket')
    if (error) setNote(`Error: ${error.message}`)
    else setNote('Bracket built — R4 pairings live')
    setBusy(false)
  }
  // Compute semi winners from semi_votes.
  const semiWinners = useMemo(() => {
    const out = {}
    for (const room of [1, 2]) {
      const votes = (semiVotes || []).filter(v => v.round_id === 'R4' && v.room === room)
      const affN = votes.filter(v => v.vote === 'aff').length
      const oppN = votes.filter(v => v.vote === 'opp').length
      const pairing = pairings.find(p => p.round_id === 'R4' && p.room === room)
      if (!pairing) continue
      let winner = null
      if (affN > oppN) winner = pairing.aff_code
      else if (oppN > affN) winner = pairing.opp_code
      out[room] = { winner, affN, oppN, decided: affN >= 8 || oppN >= 8 }
    }
    return out
  }, [semiVotes, pairings])

  const [flipModal, setFlipModal] = useState(null)  // { w1, w2, aff, opp, spinning }
  async function fillFinal() {
    const w1 = semiWinners[1]?.winner
    const w2 = semiWinners[2]?.winner
    if (!w1 || !w2) {
      setNote('Cannot fill — semi winners not decided yet. Need majority (≥8) in each panel.')
      return
    }
    // Open coin-flip modal — no side is chosen yet.
    setFlipModal({ w1, w2, aff: null, opp: null, spinning: false })
  }
  async function doFlip() {
    if (!flipModal) return
    setFlipModal(m => ({ ...m, spinning: true }))
    // 10s of theatre, then RNG.
    await new Promise(r => setTimeout(r, 10000))
    const propWins = Math.random() < 0.5
    const aff = propWins ? flipModal.w1 : flipModal.w2
    const opp = propWins ? flipModal.w2 : flipModal.w1
    setFlipModal(m => ({ ...m, spinning: false, aff, opp }))
  }
  async function commitFlip() {
    if (!flipModal?.aff || !flipModal?.opp) return
    setBusy(true); setNote(null)
    await supabase.from('pairings').delete().eq('round_id', 'R5')
    const { error } = await supabase.from('pairings').insert({
      round_id: 'R5', room: 1, aff_code: flipModal.aff, opp_code: flipModal.opp,
      judge_code: 'J1', strike_turn: 'opp',
    })
    setBusy(false)
    if (error) setNote(`Error: ${error.message}`)
    else {
      setNote(`R5 pairing set: ${flipModal.aff} (Prop) vs ${flipModal.opp} (Opp)`)
      setFlipModal(null)
    }
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
        Build R4 quarters from top 4
      </button>
      <button className="btn-secondary" onClick={fillFinal}
              disabled={busy || !(semiWinners[1]?.decided && semiWinners[2]?.decided)}
              title={semiWinners[1]?.decided && semiWinners[2]?.decided
                ? `Semi 1: ${semiWinners[1].winner} · Semi 2: ${semiWinners[2].winner}`
                : `Semi 1: ${semiWinners[1]?.affN||0}-${semiWinners[1]?.oppN||0} · Semi 2: ${semiWinners[2]?.affN||0}-${semiWinners[2]?.oppN||0}`}>
        Fill R5 (coin flip)
        {semiWinners[1]?.decided && semiWinners[2]?.decided && (
          <span style={{marginLeft: 8, fontSize: 10}}>{semiWinners[1].winner} vs {semiWinners[2].winner}</span>
        )}
      </button>
    </div>

    {flipModal && (
      <div className="flip-backdrop" onClick={e => { if (e.target === e.currentTarget) setFlipModal(null) }}>
        <div className={`flip-modal ${flipModal.spinning ? 'spinning' : ''} ${flipModal.aff ? 'revealed' : ''}`}>
          <span className="kicker">The Final · Coin Flip</span>
          <h2>{flipModal.aff ? 'Sides set.' : flipModal.spinning ? 'Flipping…' : 'Ready to flip.'}</h2>
          <div className="flip-pair">
            <div className={`flip-slot ${flipModal.aff === flipModal.w1 ? 'is-aff' : flipModal.opp === flipModal.w1 ? 'is-opp' : ''}`}>
              <span className="flip-code">{flipModal.w1}</span>
              {flipModal.aff && (
                <span className={`flip-side ${flipModal.aff === flipModal.w1 ? 'aff' : 'opp'}`}>
                  {flipModal.aff === flipModal.w1 ? 'PROP' : 'OPP'}
                </span>
              )}
            </div>
            <div className="flip-coin">
              <div className="coin"><span className="face heads">P</span><span className="face tails">O</span></div>
            </div>
            <div className={`flip-slot ${flipModal.aff === flipModal.w2 ? 'is-aff' : flipModal.opp === flipModal.w2 ? 'is-opp' : ''}`}>
              <span className="flip-code">{flipModal.w2}</span>
              {flipModal.aff && (
                <span className={`flip-side ${flipModal.aff === flipModal.w2 ? 'aff' : 'opp'}`}>
                  {flipModal.aff === flipModal.w2 ? 'PROP' : 'OPP'}
                </span>
              )}
            </div>
          </div>
          <div className="flip-actions">
            {!flipModal.aff ? (
              <>
                <button className="btn-primary" onClick={doFlip} disabled={flipModal.spinning}>
                  {flipModal.spinning ? 'Flipping…' : 'Flip the coin'}
                </button>
                <button className="btn-secondary" onClick={() => setFlipModal(null)}>Cancel</button>
              </>
            ) : (
              <>
                <button className="btn-primary" onClick={commitFlip} disabled={busy}>
                  Lock it in · {flipModal.aff} (Prop) vs {flipModal.opp} (Opp)
                </button>
                <button className="btn-secondary" onClick={() => setFlipModal(m => ({ ...m, aff: null, opp: null }))}>Flip again</button>
              </>
            )}
          </div>
        </div>
      </div>
    )}
    {stats.length === 0 ? (
      <div className="portal-empty"><b>No results yet.</b><span>Standings populate as ballots come in.</span></div>
    ) : (
    <div className="standings">
      <table className="fmt-table">
        <thead><tr><th>#</th><th>Code</th><th>Name</th><th>Wins</th><th>Total Points</th><th>Debates</th></tr></thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={s.code} className={i < 4 ? 'top-4' : ''}>
              <td className="rank">{i+1}</td>
              <td className="seg">{s.code}</td>
              <td>{nameByCode[s.code] || '—'}</td>
              <td><b>{s.wins}</b></td>
              <td>{s.points}</td>
              <td>{s.appearances}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="portal-hint">Top 4 advance to R4 Quarters. Wins → total points as tiebreaker.</div>
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

/* ---------------- CERTIFICATES ---------------- */
function CertificatesTab({ onMsg }) {
  const { rows: reqs } = useRealtime('certificate_requests',
    { order: { column: 'requested_at', ascending: false } }, [])
  const [busy, setBusy] = useState(null)

  async function approve(id) {
    setBusy(id); onMsg(null)
    const { error } = await supabase.rpc('approve_certificate', { p_request: id })
    if (error) onMsg(error.message); else onMsg('Certificate approved')
    setBusy(null)
  }
  async function remove(id) {
    if (!confirm('Delete this certificate request?')) return
    const { error } = await supabase.from('certificate_requests').delete().eq('id', id)
    if (error) onMsg(error.message)
  }

  const pending = (reqs || []).filter(r => !r.approved_at)
  const approved = (reqs || []).filter(r => r.approved_at)

  return (
    <div className="cert-admin">
      <h2 className="portal-h2">Pending signature ({pending.length})</h2>
      {pending.length === 0 && (
        <div className="portal-empty"><b>No requests waiting.</b>
          <span>New certificate requests appear here in real time.</span>
        </div>
      )}
      <div className="cert-list">
        {pending.map(r => (
          <div key={r.id} className="cert-row wait">
            <span className="cert-code">{r.code}</span>
            <span className="cert-placement">{r.placement}</span>
            <span className="cert-name">{r.name}</span>
            <span className="cert-when">{new Date(r.requested_at).toLocaleString()}</span>
            <div className="cert-actions">
              <button className="btn-primary" onClick={() => approve(r.id)} disabled={busy === r.id}>
                {busy === r.id ? 'Signing…' : '✓ Sign & approve'}
              </button>
              <button className="wl-del" onClick={() => remove(r.id)} title="Reject">×</button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="portal-h2">Approved ({approved.length})</h2>
      <div className="cert-list">
        {approved.map(r => (
          <div key={r.id} className="cert-row ok">
            <span className="cert-code">{r.code}</span>
            <span className="cert-placement">{r.placement}</span>
            <span className="cert-name">{r.name}</span>
            <span className="cert-when">{new Date(r.approved_at).toLocaleString()}</span>
            <div className="cert-actions">
              <span className="cert-signed">Signed · {r.signature_name}</span>
              <button className="wl-del" onClick={() => remove(r.id)} title="Revoke">×</button>
            </div>
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

/* ---------------- REGISTRATIONS ---------------- */
function RegistrationsTab({ onMsg }) {
  const { rows: regs } = useRealtime('registrations',
    { order: { column: 'submitted_at', ascending: false } }, [])
  const { rows: speakers } = useRealtime('registration_speakers', {}, [])
  const [expanded, setExpanded] = useState(null)
  const [busy, setBusy] = useState(false)

  const speakersByReg = useMemo(() => {
    const m = {}
    for (const s of speakers || []) (m[s.registration_id] ||= []).push(s)
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.order_index - b.order_index)
    return m
  }, [speakers])

  async function setStatus(id, status) {
    setBusy(true)
    if (status === 'approved') {
      // Approve → upsert speakers into allowed_users AND email each one.
      const { data: speakerList, error } = await supabase.rpc('approve_team_registration', { p_reg_id: id })
      if (error) { setBusy(false); onMsg?.(`Error: ${error.message}`); return }
      const targets = (speakerList || []).filter(s => s.speaker_email)
      // Sequential with a 150ms gap (~6/sec) to stay under Resend's 10/sec free-tier limit.
      let ok = 0
      for (const s of targets) {
        const { data, error: mailErr } = await supabase.functions.invoke('send-invite', {
          body: { email: s.speaker_email, role: 'scholar', code: s.speaker_code, name: s.speaker_name }
        })
        if (!mailErr && !data?.error) ok++
        await new Promise(res => setTimeout(res, 150))
      }
      setBusy(false)
      onMsg?.(`Team approved · ${ok}/${targets.length} invite emails sent`)
      return
    }

    // Waitlist / Decline → email the CAPTAIN (not the whole team).
    if (status === 'waitlisted' || status === 'declined') {
      const reg = (regs || []).find(r => r.id === id)
      const { error: updErr } = await supabase.from('registrations')
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq('id', id)
      if (updErr) { setBusy(false); onMsg?.(`Error: ${updErr.message}`); return }
      if (reg?.captain_email) {
        const { data, error: mailErr } = await supabase.functions.invoke('send-invite', {
          body: {
            email: reg.captain_email,
            name: reg.captain_name,
            kind: status === 'waitlisted' ? 'waitlist' : 'decline',
            context: reg.team_name || reg.class_name || `Class ${reg.class_letter || ''}`.trim(),
          }
        })
        setBusy(false)
        const funcErr = data?.error || mailErr?.message
        if (funcErr) onMsg?.(`Set ${status}, email failed: ${funcErr}`)
        else onMsg?.(`Team ${status} · captain notified (${reg.captain_email})`)
      } else {
        setBusy(false)
        onMsg?.(`Team ${status} (no captain email on file)`)
      }
      return
    }

    // Reset / other → just update status silently.
    const { error } = await supabase.from('registrations')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    setBusy(false)
    if (error) onMsg?.(`Error: ${error.message}`)
    else onMsg?.(`Registration ${status}`)
  }

  async function remove(id) {
    if (!confirm('Delete this registration? Cannot be undone.')) return
    setBusy(true)
    const { error } = await supabase.from('registrations').delete().eq('id', id)
    setBusy(false)
    if (error) onMsg?.(`Error: ${error.message}`)
    else onMsg?.('Registration deleted')
  }

  function exportCsv() {
    const rows = [['Class', 'Team', 'School', 'Cohort', 'Captain', 'Email', 'Phone', 'Status', 'Speakers', 'Submitted', 'Notes']]
    for (const r of regs || []) {
      const list = (speakersByReg[r.id] || [])
        .map(s => `${s.speaker_code || '?'} ${s.speaker_name}${s.speaker_email ? ` <${s.speaker_email}>` : ''}${s.speaker_year ? ` [${s.speaker_year}]` : ''}`)
        .join(' | ')
      rows.push([
        r.class_letter || '', r.team_name || r.class_name, r.school_name || '', r.cohort || '',
        r.captain_name, r.captain_email, r.captain_phone || '',
        r.status, list, r.submitted_at, r.notes || ''
      ])
    }
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `registrations_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const counts = useMemo(() => {
    const c = { total: 0, pending: 0, approved: 0, waitlisted: 0, declined: 0, speakers: 0 }
    for (const r of regs || []) {
      c.total++
      c[r.status] = (c[r.status] || 0) + 1
      c.speakers += (speakersByReg[r.id] || []).length
    }
    return c
  }, [regs, speakersByReg])

  return (
    <>
      <div className="portal-stat-row">
        <Stat k="Classes" v={counts.total} />
        <Stat k="Speakers" v={counts.speakers} />
        <Stat k="Pending" v={counts.pending || 0} />
        <Stat k="Approved" v={counts.approved || 0} />
      </div>
      <div className="bracket-actions">
        <button className="btn-secondary" onClick={exportCsv} disabled={!regs?.length}>Export CSV</button>
      </div>
      {(!regs || regs.length === 0) ? (
        <div className="portal-empty"><b>No registrations yet.</b><span>Public /register form feeds this list in real-time.</span></div>
      ) : (
        <div className="regs-list">
          {regs.map(r => {
            const list = speakersByReg[r.id] || []
            const isOpen = expanded === r.id
            return (
              <div key={r.id} className={`reg-item status-${r.status}`}>
                <div className="reg-item-head" onClick={() => setExpanded(isOpen ? null : r.id)}>
                  {r.class_letter && <div className="reg-item-badge">{r.class_letter}</div>}
                  <div className="reg-item-main">
                    <div className="reg-item-class">{r.team_name || r.class_name}</div>
                    <div className="reg-item-meta">
                      {r.class_letter && <span className="tag">Class {r.class_letter}</span>}
                      {r.school_name && <span>{r.school_name}</span>}
                      {r.cohort && <span className="tag">{r.cohort.toUpperCase()}</span>}
                      <span>{list.length} speaker{list.length === 1 ? '' : 's'}</span>
                      <span>{new Date(r.submitted_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="reg-item-right">
                    <span className={`reg-status reg-status-${r.status}`}>{r.status}</span>
                    <span className="reg-chev">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isOpen && (
                  <div className="reg-item-body">
                    <div className="reg-item-captain">
                      <div><b>Captain</b> {r.captain_name}</div>
                      <div><a href={`mailto:${r.captain_email}`}>{r.captain_email}</a></div>
                      {r.captain_phone && <div><a href={`tel:${r.captain_phone}`}>{r.captain_phone}</a></div>}
                    </div>
                    <table className="fmt-table reg-speakers-table">
                      <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Phone</th><th>Year</th></tr></thead>
                      <tbody>
                        {list.map((s, i) => (
                          <tr key={s.id}>
                            <td><b>{s.speaker_code || i + 1}</b></td>
                            <td>{s.speaker_name}</td>
                            <td>{s.speaker_email || '—'}</td>
                            <td>{s.speaker_phone || '—'}</td>
                            <td>{s.speaker_year || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.notes && <div className="reg-item-notes"><b>Notes.</b> {r.notes}</div>}
                    <div className="reg-item-actions">
                      <button className="btn-primary" onClick={() => setStatus(r.id, 'approved')} disabled={busy || r.status === 'approved'}>Approve</button>
                      <button className="btn-secondary" onClick={() => setStatus(r.id, 'waitlisted')} disabled={busy || r.status === 'waitlisted'}>Waitlist</button>
                      <button className="btn-secondary" onClick={() => setStatus(r.id, 'declined')} disabled={busy || r.status === 'declined'}>Decline</button>
                      <button className="btn-secondary" onClick={() => setStatus(r.id, 'pending')} disabled={busy || r.status === 'pending'}>Reset</button>
                      <button className="btn-danger" onClick={() => remove(r.id)} disabled={busy}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ---------------- JUDGE REGISTRATIONS ---------------- */
function JudgeRegistrationsTab({ onMsg }) {
  const { rows: rawRegs } = useRealtime('judge_registrations', {}, [])
  // Sort by J-code ascending (J1, J2, …, J38); unassigned rows fall to the end by submitted_at.
  const regs = useMemo(() => {
    const arr = rawRegs || []
    return [...arr].sort((a, b) => {
      const na = a.assigned_code ? parseInt(a.assigned_code.replace(/^J/, ''), 10) : Infinity
      const nb = b.assigned_code ? parseInt(b.assigned_code.replace(/^J/, ''), 10) : Infinity
      if (na !== nb) return na - nb
      return new Date(a.submitted_at) - new Date(b.submitted_at)
    })
  }, [rawRegs])
  const [expanded, setExpanded] = useState(null)
  const [busy, setBusy] = useState(false)

  async function approve(id) {
    setBusy(true)
    const { data, error } = await supabase.rpc('approve_judge_registration', { p_reg_id: id })
    if (error) { setBusy(false); onMsg?.(`Error: ${error.message}`); return }
    const j = (data || [])[0]
    if (!j) { setBusy(false); onMsg?.('Approved but no data returned'); return }
    const { error: emailErr } = await supabase.functions.invoke('send-invite', {
      body: { email: j.judge_email, role: 'judge', code: j.assigned_code, name: j.judge_name }
    })
    setBusy(false)
    if (emailErr) onMsg?.(`Approved as ${j.assigned_code}, email failed: ${emailErr.message}`)
    else onMsg?.(`Approved as ${j.assigned_code} · invite email sent`)
  }

  async function setStatus(id, status) {
    setBusy(true)
    const reg = (regs || []).find(r => r.id === id)
    const { error } = await supabase.from('judge_registrations')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { setBusy(false); onMsg?.(`Error: ${error.message}`); return }
    if ((status === 'waitlisted' || status === 'declined') && reg?.email) {
      const { data, error: mailErr } = await supabase.functions.invoke('send-invite', {
        body: {
          email: reg.email,
          name: reg.full_name,
          kind: status === 'waitlisted' ? 'waitlist' : 'decline',
          context: 'Judging Panel',
        }
      })
      setBusy(false)
      const funcErr = data?.error || mailErr?.message
      if (funcErr) onMsg?.(`Set ${status}, email failed: ${funcErr}`)
      else onMsg?.(`Judge ${status} · notified (${reg.email})`)
      return
    }
    setBusy(false)
    onMsg?.(`Judge ${status}`)
  }

  async function remove(id) {
    if (!confirm('Delete this judge registration? Cannot be undone.')) return
    setBusy(true)
    const { error } = await supabase.from('judge_registrations').delete().eq('id', id)
    setBusy(false)
    if (error) onMsg?.(`Error: ${error.message}`)
    else onMsg?.('Judge registration deleted')
  }

  const counts = useMemo(() => {
    const c = { total: 0, pending: 0, approved: 0, waitlisted: 0, declined: 0 }
    for (const r of regs || []) { c.total++; c[r.status] = (c[r.status] || 0) + 1 }
    return c
  }, [regs])

  return (
    <>
      <div className="portal-stat-row">
        <Stat k="Judges" v={counts.total} />
        <Stat k="Pending" v={counts.pending || 0} />
        <Stat k="Approved" v={counts.approved || 0} />
        <Stat k="Waitlisted" v={counts.waitlisted || 0} />
      </div>
      {(!regs || regs.length === 0) ? (
        <div className="portal-empty"><b>No judge registrations yet.</b><span>Public /register (Judge tab) feeds this list in real-time.</span></div>
      ) : (
        <div className="regs-list">
          {regs.map(r => {
            const isOpen = expanded === r.id
            return (
              <div key={r.id} className={`reg-item status-${r.status}`}>
                <div className="reg-item-head" onClick={() => setExpanded(isOpen ? null : r.id)}>
                  {r.assigned_code && <div className="reg-item-badge">{r.assigned_code}</div>}
                  <div className="reg-item-main">
                    <div className="reg-item-class">{r.full_name}</div>
                    <div className="reg-item-meta">
                      {r.organization && <span>{r.organization}</span>}
                      {r.experience && <span className="tag">{r.experience.toUpperCase()}</span>}
                      <span>{r.email}</span>
                      <span>{new Date(r.submitted_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="reg-item-right">
                    <span className={`reg-status reg-status-${r.status}`}>{r.status}</span>
                    <span className="reg-chev">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isOpen && (
                  <div className="reg-item-body">
                    <div className="reg-item-captain">
                      <div><b>Email</b> <a href={`mailto:${r.email}`}>{r.email}</a></div>
                      {r.phone && <div><b>Phone</b> <a href={`tel:${r.phone}`}>{r.phone}</a></div>}
                      <div><b>Can attend</b> {r.can_attend ? 'Yes' : 'No'}</div>
                    </div>
                    {r.notes && <div className="reg-item-notes"><b>Notes.</b> {r.notes}</div>}
                    <div className="reg-item-actions">
                      <button className="btn-primary" onClick={() => approve(r.id)}
                        disabled={busy || r.status === 'approved'}>
                        {r.status === 'approved' ? `Approved · ${r.assigned_code}` : 'Approve & email'}
                      </button>
                      <button className="btn-secondary" onClick={() => setStatus(r.id, 'waitlisted')} disabled={busy || r.status === 'waitlisted'}>Waitlist</button>
                      <button className="btn-secondary" onClick={() => setStatus(r.id, 'declined')} disabled={busy || r.status === 'declined'}>Decline</button>
                      <button className="btn-secondary" onClick={() => setStatus(r.id, 'pending')} disabled={busy || r.status === 'pending'}>Reset</button>
                      <button className="btn-danger" onClick={() => remove(r.id)} disabled={busy}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ---------------- FEEDBACK PREVIEW (admin-only, ignores public gate) ---------------- */
function FeedbackPreviewTab({ pairings, ballots, rounds, motions }) {
  const { rows: allowed } = useRealtime('allowed_users', {}, [])
  const { rows: semiVotes } = useRealtime('semi_votes', {}, [])
  const [mode, setMode] = useState('scholar') // 'scholar' | 'room'
  const [scholarCode, setScholarCode] = useState('')
  const [roundFilter, setRoundFilter] = useState('R1')
  const [roomFilter, setRoomFilter] = useState('')

  const scholars = useMemo(
    () => (allowed || []).filter(u => u.role === 'scholar').sort((a, b) => {
      const pa = a.code?.match(/^([A-F])(\d+)/); const pb = b.code?.match(/^([A-F])(\d+)/)
      if (!pa || !pb) return (a.code || '').localeCompare(b.code || '')
      return pa[1].localeCompare(pb[1]) || (parseInt(pa[2], 10) - parseInt(pb[2], 10))
    }),
    [allowed]
  )
  const nameByCode = useMemo(() => {
    const m = {}
    for (const u of (allowed || [])) if (u.code) m[u.code] = u.name
    return m
  }, [allowed])
  const motionById = useMemo(() => {
    const m = {}
    for (const x of (motions || [])) m[x.id] = x
    return m
  }, [motions])

  const AXES = [
    ['argument', 'Argument'], ['rebuttal', 'Rebuttal & CX'],
    ['delivery', 'Delivery'], ['persuasion', 'Persuasion'],
  ]
  const SPEECHES = [
    ['prop_const','Prop constructive'],
    ['opp_open','Opp opening'],
    ['prop_rebut','Prop rebuttal'],
    ['opp_close','Opp closing'],
    ['prop_close','Prop closing'],
  ]

  return (
    <div className="feedback-preview">
      <div className="fp-mode-tabs">
        <button className={mode === 'scholar' ? 'active' : ''} onClick={() => setMode('scholar')}>By Scholar</button>
        <button className={mode === 'room' ? 'active' : ''} onClick={() => setMode('room')}>By Room (full ballot)</button>
      </div>

      {mode === 'scholar' ? (
        <>
          <div className="fp-controls">
            <label>
              <span>Scholar</span>
              <select value={scholarCode} onChange={e => setScholarCode(e.target.value)}>
                <option value="">— Pick a scholar —</option>
                {scholars.map(s => (
                  <option key={s.code} value={s.code}>{s.code} · {s.name || s.email}</option>
                ))}
              </select>
            </label>
          </div>

          {scholarCode ? (
            <div className="fp-scholar-view">
              <div className="fp-scholar-hd">
                <span className="kicker">Preview · admin only</span>
                <h3>{scholarCode} · {nameByCode[scholarCode] || '—'}</h3>
              </div>
              {(rounds || []).filter(r => ['R1','R2','R3'].includes(r.id)).map(r => {
                const p = pairings.find(x => x.round_id === r.id && (x.aff_code === scholarCode || x.opp_code === scholarCode))
                if (!p) return (
                  <div key={r.id} className="fp-row empty">{r.id} — no assignment</div>
                )
                const mySide = p.aff_code === scholarCode ? 'aff' : 'opp'
                const oppSide = mySide === 'aff' ? 'opp' : 'aff'
                const oppCode = mySide === 'aff' ? p.opp_code : p.aff_code
                const b = ballots.find(x => x.round_id === r.id && x.room === p.room)
                const myScores = b ? AXES.map(([k]) => b[`${mySide}_${k}`] || 0) : null
                const oppScores = b ? AXES.map(([k]) => b[`${oppSide}_${k}`] || 0) : null
                const myTotal = myScores ? myScores.reduce((s, n) => s + n, 0) : null
                const oppTotal = oppScores ? oppScores.reduce((s, n) => s + n, 0) : null
                const won = b ? (b.winner === mySide) : null
                const forfeited = b?.forfeit_side === mySide
                const myNote = b ? b[`${mySide}_note`] : null
                return (
                  <div key={r.id} className="fp-row">
                    <div className="fp-row-hd">
                      <span className="fp-round">{r.id}</span>
                      <span>Room #{p.room}</span>
                      <span className={`fp-side ${mySide}`}>{mySide === 'aff' ? 'PROP' : 'OPP'}</span>
                      <span>vs {oppCode}</span>
                      <span>Judge {p.judge_code}</span>
                      {b ? (
                        <span className={`fp-result ${won ? 'won' : 'lost'}`}>{won ? 'W' : 'L'} · {myTotal}/20</span>
                      ) : <span className="fp-result pending">No ballot</span>}
                    </div>
                    {b && (
                      <div className="fp-scorecard">
                        {forfeited && <div className="fp-forfeit">Forfeit recorded for {scholarCode}.</div>}
                        <table className="fmt-table dp-scorecard">
                          <thead><tr><th></th><th>{scholarCode}</th><th>{oppCode}</th></tr></thead>
                          <tbody>
                            {AXES.map(([k, label], i) => (
                              <tr key={k}><td className="axis">{label}</td>
                                <td className={`score ${myScores[i] > oppScores[i] ? 'higher' : ''}`}>{myScores[i]}/5</td>
                                <td className={`score ${oppScores[i] > myScores[i] ? 'higher' : ''}`}>{oppScores[i]}/5</td>
                              </tr>
                            ))}
                            <tr className="total-row">
                              <td>Total</td>
                              <td><b>{myTotal}/20</b></td><td><b>{oppTotal}/20</b></td>
                            </tr>
                          </tbody>
                        </table>
                        {myNote && (
                          <div className="dp-note-block">
                            <span className="dp-note-label">Note from Judge {p.judge_code}</span>
                            <div className="dp-note">"{myNote}"</div>
                          </div>
                        )}
                        {(() => {
                          // Filter speech notes to those attributed to this scholar's side.
                          const mine_speeches = mySide === 'aff'
                            ? [['prop_const', 'Prop constructive'], ['prop_rebut', 'Prop rebuttal'], ['prop_close', 'Prop closing']]
                            : [['opp_open', 'Opp opening'], ['opp_close', 'Opp closing']]
                          const notes = b.speech_notes || {}
                          const filled = mine_speeches.filter(([k]) => notes[k])
                          if (filled.length === 0) return null
                          return (
                            <div className="fp-speech-block">
                              <span className="dp-note-label">Judge's flow — what {scholarCode} said</span>
                              {filled.map(([k, label]) => (
                                <div key={k} className="fp-speech-item">
                                  <b>{label}</b>
                                  <span>{notes[k]}</span>
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="portal-empty"><b>Pick a scholar</b><span>See their round-by-round scores + judge notes exactly as they will after release.</span></div>
          )}
        </>
      ) : (
        <>
          <div className="fp-controls">
            <label>
              <span>Round</span>
              <select value={roundFilter} onChange={e => { setRoundFilter(e.target.value); setRoomFilter('') }}>
                {['R1','R2','R3'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label>
              <span>Room</span>
              <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)}>
                <option value="">— Pick a room —</option>
                {pairings.filter(p => p.round_id === roundFilter).sort((a, b) => a.room - b.room).map(p => (
                  <option key={p.id} value={p.room}>Room #{p.room} · {p.aff_code} vs {p.opp_code} · Judge {p.judge_code}</option>
                ))}
              </select>
            </label>
          </div>

          {roomFilter ? (() => {
            const p = pairings.find(x => x.round_id === roundFilter && String(x.room) === String(roomFilter))
            const b = ballots.find(x => x.round_id === roundFilter && String(x.room) === String(roomFilter))
            const motion = p ? motionById[p.final_motion_id] : null
            if (!p) return <div className="portal-empty">No pairing found.</div>
            const affTotal = b ? AXES.reduce((s, [k]) => s + (b[`aff_${k}`] || 0), 0) : null
            const oppTotal = b ? AXES.reduce((s, [k]) => s + (b[`opp_${k}`] || 0), 0) : null
            return (
              <div className="fp-room-view">
                <div className="fp-scholar-hd">
                  <span className="kicker">{roundFilter} · Room #{p.room} · Judge {p.judge_code}</span>
                  <h3>{p.aff_code} · {nameByCode[p.aff_code] || '—'} <span style={{opacity: 0.5}}>vs</span> {p.opp_code} · {nameByCode[p.opp_code] || '—'}</h3>
                </div>
                {motion && (
                  <div className="fp-motion">
                    <span className={`tag`} style={{background: motion.kind === 'Policy' ? '#1dafec' : motion.kind === 'Value' ? '#efb34a' : '#8cc63e'}}>{motion.kind}</span>
                    <span>{motion.text}</span>
                  </div>
                )}
                {b ? (
                  <>
                    <table className="fmt-table dp-scorecard">
                      <thead><tr><th></th><th>Prop · {p.aff_code}</th><th>Opp · {p.opp_code}</th></tr></thead>
                      <tbody>
                        {AXES.map(([k, label]) => (
                          <tr key={k}><td className="axis">{label}</td>
                            <td className={`score ${(b[`aff_${k}`]||0) > (b[`opp_${k}`]||0) ? 'higher' : ''}`}>{b[`aff_${k}`] ?? 0}/5</td>
                            <td className={`score ${(b[`opp_${k}`]||0) > (b[`aff_${k}`]||0) ? 'higher' : ''}`}>{b[`opp_${k}`] ?? 0}/5</td>
                          </tr>
                        ))}
                        <tr className="total-row">
                          <td>Total</td>
                          <td><b>{affTotal}/20</b></td><td><b>{oppTotal}/20</b></td>
                        </tr>
                        <tr>
                          <td><b>Winner</b></td>
                          <td colSpan={2}>{b.winner === 'aff' ? `Prop · ${p.aff_code}` : `Opp · ${p.opp_code}`}
                            {b.forfeit_side && <span className="fp-forfeit-inline"> (forfeit on {b.forfeit_side})</span>}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {(b.aff_note || b.opp_note) && (
                      <div className="fp-notes-block">
                        <span className="dp-note-label">Judge notes to speakers</span>
                        {b.aff_note && <div className="dp-note"><b>→ {p.aff_code}:</b> "{b.aff_note}"</div>}
                        {b.opp_note && <div className="dp-note"><b>→ {p.opp_code}:</b> "{b.opp_note}"</div>}
                      </div>
                    )}
                    {b.speech_notes && Object.values(b.speech_notes).some(v => v) && (
                      <div className="fp-speech-block">
                        <span className="dp-note-label">Judge's speech-by-speech notes</span>
                        {SPEECHES.map(([k, label]) => b.speech_notes?.[k] ? (
                          <div key={k} className="fp-speech-item">
                            <b>{label}:</b> <span>{b.speech_notes[k]}</span>
                          </div>
                        ) : null)}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="portal-empty"><b>No ballot submitted.</b></div>
                )}
              </div>
            )
          })() : (
            <div className="portal-empty"><b>Pick a room</b><span>Shows the full ballot content — every score, every note, every speech observation the judge captured.</span></div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------- TOURNAMENT STATS (many charts) ---------------- */
function StatsTab({ pairings, ballots, rounds, motions }) {
  const { rows: allowed } = useRealtime('allowed_users', {}, [])
  const { rows: semiVotes } = useRealtime('semi_votes', {}, [])

  const PRELIMS = ['R1','R2','R3']
  const AXES = ['argument','rebuttal','delivery','persuasion']
  const AXIS_LABEL = { argument: 'Argument', rebuttal: 'Rebuttal & CX', delivery: 'Delivery', persuasion: 'Persuasion' }

  // Filters
  const [roundFilter, setRoundFilter] = useState('all')      // 'all' | 'R1' | 'R2' | 'R3'
  const [classFilter, setClassFilter] = useState('all')      // 'all' | 'A'..'F'
  const [drilldown, setDrilldown] = useState(null)           // { kind: 'scholar'|'judge'|'room', ...ctx }

  const scholars = useMemo(() => (allowed || []).filter(u => u.role === 'scholar'), [allowed])
  const judges   = useMemo(() => (allowed || []).filter(u => u.role === 'judge'), [allowed])
  const nameByCode = useMemo(() => { const m = {}; for (const u of allowed || []) if (u.code) m[u.code] = u.name; return m }, [allowed])
  const classOf = (code) => code?.charAt(0) || '?'

  const prelimBallotsAll = useMemo(() => (ballots || []).filter(b => PRELIMS.includes(b.round_id)), [ballots])
  const prelimPairingsAll = useMemo(() => (pairings || []).filter(p => PRELIMS.includes(p.round_id)), [pairings])
  const prelimBallots = useMemo(() => prelimBallotsAll.filter(b => roundFilter === 'all' || b.round_id === roundFilter), [prelimBallotsAll, roundFilter])
  const prelimPairings = useMemo(() => prelimPairingsAll.filter(p => roundFilter === 'all' || p.round_id === roundFilter), [prelimPairingsAll, roundFilter])

  // Speaker stats: for each speaker, per axis + total per round
  const speakerStats = useMemo(() => {
    const s = {}
    for (const b of prelimBallots) {
      const pair = prelimPairings.find(p => p.round_id === b.round_id && p.room === b.room)
      if (!pair) continue
      for (const side of ['aff','opp']) {
        const code = side === 'aff' ? pair.aff_code : pair.opp_code
        if (!code) continue
        s[code] ||= { code, class: classOf(code), rounds: {}, totals: [], perAxis: { argument:[], rebuttal:[], delivery:[], persuasion:[] }, wins: 0, losses: 0, propRounds: 0, oppRounds: 0, forfeits: 0 }
        const total = AXES.reduce((sum, a) => sum + (b[`${side}_${a}`] || 0), 0)
        s[code].rounds[b.round_id] = { total, scores: AXES.map(a => b[`${side}_${a}`] || 0), won: b.winner === side, forfeit: b.forfeit_side === side }
        s[code].totals.push(total)
        for (const a of AXES) s[code].perAxis[a].push(b[`${side}_${a}`] || 0)
        if (b.winner === side) s[code].wins++
        else s[code].losses++
        if (side === 'aff') s[code].propRounds++
        else s[code].oppRounds++
        if (b.forfeit_side === side) s[code].forfeits++
      }
    }
    for (const c of Object.keys(s)) {
      const st = s[c]
      st.grandTotal = st.totals.reduce((a, b) => a + b, 0)
      st.avg = st.totals.length ? st.grandTotal / st.totals.length : 0
      st.stddev = st.totals.length > 1
        ? Math.sqrt(st.totals.map(v => (v - st.avg) ** 2).reduce((a, b) => a + b, 0) / st.totals.length)
        : 0
      st.name = nameByCode[st.code] || ''
      st.trajectory = PRELIMS.map(r => st.rounds[r]?.total ?? null)
    }
    return s
  }, [prelimBallots, prelimPairings, nameByCode])

  const scholarList = useMemo(() => Object.values(speakerStats).filter(s => classFilter === 'all' || s.class === classFilter), [speakerStats, classFilter])

  // Top 10 speakers by total points
  const top10Total = useMemo(() => scholarList.slice().sort((a,b) => b.grandTotal - a.grandTotal || b.wins - a.wins).slice(0, 10), [scholarList])

  // Best per axis (top 5 by total axis score across 3 rounds)
  const axisTop = useMemo(() => {
    const out = {}
    for (const a of AXES) {
      out[a] = scholarList.slice().sort((x, y) => {
        const xs = x.perAxis[a].reduce((s, n) => s + n, 0)
        const ys = y.perAxis[a].reduce((s, n) => s + n, 0)
        return ys - xs
      }).slice(0, 5).map(sp => ({ ...sp, axisSum: sp.perAxis[a].reduce((s, n) => s + n, 0) }))
    }
    return out
  }, [scholarList])

  // Score distribution histogram (per-round /20 scores)
  const scoreDist = useMemo(() => {
    const bins = new Array(21).fill(0)
    for (const sp of scholarList) for (const t of sp.totals) bins[t]++
    return bins
  }, [scholarList])

  // Prop vs Opp win rate
  const sideWinRate = useMemo(() => {
    let prop = 0, opp = 0, ff = 0
    for (const b of prelimBallots) {
      if (b.forfeit_side) ff++
      if (b.winner === 'aff') prop++
      else if (b.winner === 'opp') opp++
    }
    return { prop, opp, ff, total: prop + opp }
  }, [prelimBallots])

  // Class stats
  const classStats = useMemo(() => {
    const c = {}
    for (const sp of scholarList) {
      c[sp.class] ||= { class: sp.class, wins: 0, total: 0, count: 0, ballotsCount: 0, propWins: 0, oppWins: 0 }
      c[sp.class].wins += sp.wins
      c[sp.class].total += sp.grandTotal
      c[sp.class].ballotsCount += sp.totals.length
      c[sp.class].count++
    }
    for (const cls of Object.keys(c)) {
      c[cls].avg = c[cls].ballotsCount ? c[cls].total / c[cls].ballotsCount : 0
    }
    return Object.values(c).sort((a, b) => b.wins - a.wins)
  }, [scholarList])

  // Class MVPs — top speaker per class
  const classMVPs = useMemo(() => {
    const by = {}
    for (const sp of scholarList) {
      if (!by[sp.class] || sp.grandTotal > by[sp.class].grandTotal) by[sp.class] = sp
    }
    return Object.values(by).sort((a, b) => a.class.localeCompare(b.class))
  }, [scholarList])

  // All-tournament team (top 6 by total, ignoring class)
  const allTournamentTeam = useMemo(() => top10Total.slice(0, 6), [top10Total])

  // Class vs class matchup matrix (6x6)
  const classMatrix = useMemo(() => {
    const grid = {}
    for (const p of prelimPairings) {
      const a = classOf(p.aff_code), o = classOf(p.opp_code)
      const key = `${a}-${o}`
      grid[key] = (grid[key] || 0) + 1
    }
    return grid
  }, [prelimPairings])

  // Judge stats
  const judgeStats = useMemo(() => {
    const j = {}
    for (const b of prelimBallots) {
      const jc = b.judge_code
      j[jc] ||= { code: jc, ballots: [], propPicks: 0, oppPicks: 0, name: nameByCode[jc] || '' }
      const affTotal = AXES.reduce((s, a) => s + (b[`aff_${a}`] || 0), 0)
      const oppTotal = AXES.reduce((s, a) => s + (b[`opp_${a}`] || 0), 0)
      j[jc].ballots.push({ affTotal, oppTotal, winner: b.winner, spread: Math.abs(affTotal - oppTotal), forfeit: !!b.forfeit_side, noteLen: (b.aff_note || '').length + (b.opp_note || '').length, speechNotes: b.speech_notes || {} })
      if (b.winner === 'aff') j[jc].propPicks++
      else if (b.winner === 'opp') j[jc].oppPicks++
    }
    for (const jc of Object.keys(j)) {
      const st = j[jc]
      const scores = st.ballots.flatMap(x => [x.affTotal, x.oppTotal])
      st.avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      st.range = scores.length ? Math.max(...scores) - Math.min(...scores) : 0
      st.avgSpread = st.ballots.length ? st.ballots.reduce((s, x) => s + x.spread, 0) / st.ballots.length : 0
      st.propLean = st.propPicks + st.oppPicks > 0 ? st.propPicks / (st.propPicks + st.oppPicks) : 0.5
      st.avgNoteLen = st.ballots.length ? st.ballots.reduce((s, x) => s + x.noteLen, 0) / st.ballots.length : 0
      st.speechFillRate = st.ballots.reduce((s, x) => s + Object.values(x.speechNotes).filter(v => v && v.length).length, 0) / (st.ballots.length * 5)
    }
    return Object.values(j)
  }, [prelimBallots, nameByCode])

  // Motion stats — did surviving motions favor Prop or Opp?
  const motionStats = useMemo(() => {
    const m = {}
    for (const p of prelimPairings) {
      if (!p.final_motion_id) continue
      const motion = (motions || []).find(mm => mm.id === p.final_motion_id)
      if (!motion) continue
      m[motion.id] ||= { id: motion.id, text: motion.text, kind: motion.kind, roundId: motion.round_id, survived: 0, propWins: 0, oppWins: 0, totalScore: 0, count: 0, spreads: [] }
      m[motion.id].survived++
      const b = prelimBallots.find(bb => bb.round_id === p.round_id && bb.room === p.room)
      if (b) {
        m[motion.id].count++
        const aff = AXES.reduce((s, a) => s + (b[`aff_${a}`] || 0), 0)
        const opp = AXES.reduce((s, a) => s + (b[`opp_${a}`] || 0), 0)
        m[motion.id].totalScore += aff + opp
        m[motion.id].spreads.push(Math.abs(aff - opp))
        if (b.winner === 'aff') m[motion.id].propWins++
        else if (b.winner === 'opp') m[motion.id].oppWins++
      }
    }
    for (const mm of Object.values(m)) {
      mm.avgScore = mm.count ? mm.totalScore / (mm.count * 2) : 0
      mm.avgSpread = mm.spreads.length ? mm.spreads.reduce((a, b) => a + b, 0) / mm.spreads.length : 0
    }
    return Object.values(m)
  }, [prelimPairings, motions, prelimBallots])

  // Motion kind winrate
  const kindStats = useMemo(() => {
    const k = { Policy: { prop: 0, opp: 0, tot: 0, sumScore: 0, count: 0 }, Value: { prop: 0, opp: 0, tot: 0, sumScore: 0, count: 0 }, Metaphor: { prop: 0, opp: 0, tot: 0, sumScore: 0, count: 0 } }
    for (const p of prelimPairings) {
      if (!p.final_motion_id) continue
      const motion = (motions || []).find(mm => mm.id === p.final_motion_id)
      if (!motion || !k[motion.kind]) continue
      const b = prelimBallots.find(bb => bb.round_id === p.round_id && bb.room === p.room)
      if (b) {
        k[motion.kind].tot++
        if (b.winner === 'aff') k[motion.kind].prop++
        else if (b.winner === 'opp') k[motion.kind].opp++
        const aff = AXES.reduce((s, a) => s + (b[`aff_${a}`] || 0), 0)
        const opp = AXES.reduce((s, a) => s + (b[`opp_${a}`] || 0), 0)
        k[motion.kind].sumScore += aff + opp
        k[motion.kind].count += 2
      }
    }
    for (const kk of Object.keys(k)) k[kk].avgScore = k[kk].count ? k[kk].sumScore / k[kk].count : 0
    return k
  }, [prelimPairings, motions, prelimBallots])

  // Round-level pacing
  const roundStats = useMemo(() => {
    const out = {}
    for (const r of PRELIMS) {
      const bs = prelimBallots.filter(b => b.round_id === r)
      const scores = bs.flatMap(b => [
        AXES.reduce((s, a) => s + (b[`aff_${a}`] || 0), 0),
        AXES.reduce((s, a) => s + (b[`opp_${a}`] || 0), 0),
      ])
      const spreads = bs.map(b => {
        const aff = AXES.reduce((s, a) => s + (b[`aff_${a}`] || 0), 0)
        const opp = AXES.reduce((s, a) => s + (b[`opp_${a}`] || 0), 0)
        return Math.abs(aff - opp)
      })
      out[r] = {
        round: r,
        ballots: bs.length,
        avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        avgSpread: spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0,
        forfeits: bs.filter(b => b.forfeit_side).length,
        propWins: bs.filter(b => b.winner === 'aff').length,
        oppWins: bs.filter(b => b.winner === 'opp').length,
        firstSubmit: bs.map(b => b.submitted_at).sort()[0],
        lastSubmit: bs.map(b => b.submitted_at).sort().slice(-1)[0],
      }
    }
    return out
  }, [prelimBallots])

  // Storytelling stats
  const stories = useMemo(() => {
    // Comeback: biggest R1 → R3 growth
    const comebacks = scholarList
      .filter(s => s.rounds.R1 && s.rounds.R3)
      .map(s => ({ ...s, delta: (s.rounds.R3.total - s.rounds.R1.total) }))
      .sort((a, b) => b.delta - a.delta)
    // Clutch: smallest winning margin
    const clutchBallots = prelimBallots.map(b => {
      const aff = AXES.reduce((s, a) => s + (b[`aff_${a}`] || 0), 0)
      const opp = AXES.reduce((s, a) => s + (b[`opp_${a}`] || 0), 0)
      const pair = prelimPairings.find(p => p.round_id === b.round_id && p.room === b.room)
      return { round: b.round_id, room: b.room, aff, opp, spread: Math.abs(aff - opp), winnerCode: b.winner === 'aff' ? pair?.aff_code : pair?.opp_code, loserCode: b.winner === 'aff' ? pair?.opp_code : pair?.aff_code, forfeit: !!b.forfeit_side }
    }).filter(x => !x.forfeit)
    const clutch = clutchBallots.slice().sort((a, b) => a.spread - b.spread).slice(0, 5)
    const domination = clutchBallots.slice().sort((a, b) => b.spread - a.spread).slice(0, 5)
    // Reversals: winner had lower total
    const reversals = clutchBallots.filter(x => x.winnerCode && ((x.winnerCode === (prelimPairings.find(p => p.round_id === x.round && p.room === x.room)?.aff_code) && x.aff < x.opp) || (x.winnerCode !== (prelimPairings.find(p => p.round_id === x.round && p.room === x.room)?.aff_code) && x.opp < x.aff)))
    // Highest single-round score
    const bestSingle = scholarList.flatMap(s => Object.entries(s.rounds).map(([r, d]) => ({ code: s.code, name: s.name, round: r, ...d }))).sort((a, b) => b.total - a.total).slice(0, 5)
    // "Grand slam" = 20/20 (all 5s)
    const grandSlams = scholarList.flatMap(s => Object.entries(s.rounds).filter(([_, d]) => d.total === 20).map(([r, d]) => ({ code: s.code, name: s.name, round: r })))
    // Should-have-been-champion = highest total not in R5 pairing
    const finalCodes = new Set([(pairings || []).find(p => p.round_id === 'R5')?.aff_code, (pairings || []).find(p => p.round_id === 'R5')?.opp_code].filter(Boolean))
    const shouldHave = scholarList.slice().filter(s => !finalCodes.has(s.code)).sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 3)
    // Streaker: longest win streak (out of 3)
    const streaks = scholarList.map(s => {
      const results = PRELIMS.map(r => s.rounds[r]?.won)
      let max = 0, cur = 0
      for (const w of results) { if (w) { cur++; max = Math.max(max, cur) } else cur = 0 }
      return { ...s, streak: max }
    }).filter(s => s.streak >= 3)
    return { comebacks, clutch, domination, reversals, bestSingle, grandSlams, shouldHave, streaks }
  }, [scholarList, prelimBallots, prelimPairings, pairings])

  // Semi/final vote analytics
  const semiStats = useMemo(() => {
    const rooms = {}
    for (const room of [1, 2]) {
      const votes = (semiVotes || []).filter(v => v.round_id === 'R4' && v.room === room)
      const aff = votes.filter(v => v.vote === 'aff').length
      const opp = votes.filter(v => v.vote === 'opp').length
      rooms[room] = { room, aff, opp, gap: Math.abs(aff - opp), total: aff + opp }
    }
    const finalVotes = (semiVotes || []).filter(v => v.round_id === 'R5')
    const finalAff = finalVotes.filter(v => v.vote === 'aff').length
    const finalOpp = finalVotes.filter(v => v.vote === 'opp').length
    return { rooms, final: { aff: finalAff, opp: finalOpp, gap: Math.abs(finalAff - finalOpp), total: finalAff + finalOpp } }
  }, [semiVotes])

  // Champion / Runner-up journey
  const championJourney = useMemo(() => {
    const finalPair = (pairings || []).find(p => p.round_id === 'R5')
    if (!finalPair) return null
    const finalVotes = (semiVotes || []).filter(v => v.round_id === 'R5' && v.room === 1)
    const winnerSide = finalVotes.filter(v => v.vote === 'aff').length >= finalVotes.filter(v => v.vote === 'opp').length ? 'aff' : 'opp'
    const champCode = winnerSide === 'aff' ? finalPair.aff_code : finalPair.opp_code
    const runnerCode = winnerSide === 'aff' ? finalPair.opp_code : finalPair.aff_code
    const journey = (code) => PRELIMS.concat(['R4','R5']).map(r => {
      const p = (pairings || []).find(x => x.round_id === r && (x.aff_code === code || x.opp_code === code))
      if (!p) return { round: r, none: true }
      const side = p.aff_code === code ? 'aff' : 'opp'
      const oppCode = side === 'aff' ? p.opp_code : p.aff_code
      if (r === 'R4' || r === 'R5') {
        const votes = (semiVotes || []).filter(v => v.round_id === r && v.room === p.room)
        const myVotes = votes.filter(v => v.vote === side).length
        const otherVotes = votes.filter(v => v.vote !== side).length
        return { round: r, room: p.room, side, oppCode, panel: myVotes, against: otherVotes, won: myVotes > otherVotes }
      }
      const b = (ballots || []).find(x => x.round_id === r && x.room === p.room)
      if (!b) return { round: r, room: p.room, side, oppCode, none: true }
      const myTotal = AXES.reduce((s, a) => s + (b[`${side}_${a}`] || 0), 0)
      const otherTotal = AXES.reduce((s, a) => s + (b[`${side === 'aff' ? 'opp' : 'aff'}_${a}`] || 0), 0)
      return { round: r, room: p.room, side, oppCode, myTotal, otherTotal, won: b.winner === side }
    })
    return { champCode, runnerCode, champ: journey(champCode), runner: journey(runnerCode) }
  }, [pairings, semiVotes, ballots])

  // Content stats
  const contentStats = useMemo(() => {
    const notes = prelimBallots.flatMap(b => [b.aff_note, b.opp_note].filter(Boolean))
    const speechNotes = prelimBallots.flatMap(b => Object.values(b.speech_notes || {}).filter(v => v && v.length))
    const allText = notes.concat(speechNotes).join(' ')
    const words = allText.split(/\s+/).filter(w => w.length > 3).map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
    const wordFreq = {}
    for (const w of words) wordFreq[w] = (wordFreq[w] || 0) + 1
    const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 20)
    const totalWords = words.length
    const noteLenAvg = notes.length ? notes.reduce((s, n) => s + n.length, 0) / notes.length : 0
    const longestNote = notes.slice().sort((a, b) => b.length - a.length)[0] || ''
    return { totalWords, noteLenAvg, longestNote, topWords, totalNotes: notes.length, totalSpeechNotes: speechNotes.length }
  }, [prelimBallots])

  // Headline numbers
  const totalBallots = prelimBallots.length
  const totalForfeits = prelimBallots.filter(b => b.forfeit_side).length
  const totalSemiVotes = (semiVotes || []).length
  const judgeHours = judgeStats.reduce((s, j) => s + j.ballots.length, 0) // 1 ballot = 1 hour
  const winningClass = classStats[0]?.class
  const totalPointsAwarded = prelimBallots.reduce((s, b) => s + AXES.reduce((ss, a) => ss + (b[`aff_${a}`] || 0) + (b[`opp_${a}`] || 0), 0), 0)

  return (
    <div className="stats-tab">
      {/* FILTER BAR — sticky top */}
      <div className="stats-filters">
        <div className="sf-group">
          <span className="sf-lbl">Round</span>
          {['all','R1','R2','R3'].map(r => (
            <button key={r} className={`sf-btn ${roundFilter === r ? 'active' : ''}`} onClick={() => setRoundFilter(r)}>
              {r === 'all' ? 'All' : r}
            </button>
          ))}
        </div>
        <div className="sf-group">
          <span className="sf-lbl">Class</span>
          {['all','A','B','C','D','E','F'].map(c => (
            <button key={c} className={`sf-btn ${classFilter === c ? 'active' : ''}`} onClick={() => setClassFilter(c)}>
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
        {(roundFilter !== 'all' || classFilter !== 'all') && (
          <button className="sf-clear" onClick={() => { setRoundFilter('all'); setClassFilter('all') }}>× Reset</button>
        )}
        <div className="sf-tip">Click any scholar or judge code below to drill in →</div>
      </div>

      {drilldown && (
        <DrilldownDrawer
          drilldown={drilldown}
          onClose={() => setDrilldown(null)}
          allowed={allowed || []}
          nameByCode={nameByCode}
          pairings={pairings || []}
          ballots={ballots || []}
          motions={motions || []}
          semiVotes={semiVotes || []}
          axes={AXES}
          axisLabel={AXIS_LABEL}
        />
      )}

      {/* HEADLINE */}
      <section className="ss ss-headline">
        <div className="ss-hd"><h3>Headline</h3><span>The top-line numbers</span></div>
        <div className="stat-row">
          <StatCard k="Total ballots" v={totalBallots + totalSemiVotes} sub={`${totalBallots} prelim + ${totalSemiVotes} panel`} />
          <StatCard k="Forfeits" v={totalForfeits} sub="prelim rooms" />
          <StatCard k="Judge-hours" v={judgeHours} sub="~1 hr per ballot" />
          <StatCard k="Winning class" v={winningClass || '—'} sub={`${classStats[0]?.wins || 0} wins`} />
          <StatCard k="Points awarded" v={totalPointsAwarded} sub="across all axes" />
          <StatCard k="Scholars" v={scholars.length} sub="60 target" />
          <StatCard k="Judges" v={judges.length} sub="30 target" />
        </div>
      </section>

      {/* TOP 10 */}
      <section className="ss">
        <div className="ss-hd"><h3>Top 10 speakers</h3><span>Click a row to drill in</span></div>
        <div className="s-bars">
          {top10Total.map((s, i) => (
            <div key={s.code} className="s-bar-row clickable" onClick={() => setDrilldown({ kind: 'scholar', code: s.code })}>
              <div className="s-bar-lbl">
                <span>{i+1}. {s.code} · {s.name || '—'}</span>
                <span className="s-bar-badge">{s.class}</span>
              </div>
              <div className="s-bar-track">
                <div className="s-bar-fill" style={{ width: `${(s.grandTotal / 60) * 100}%`, background: '#8cc63e' }} />
              </div>
              <div className="s-bar-val">{s.grandTotal}<small> · {s.wins}W {s.losses}L</small></div>
            </div>
          ))}
        </div>
      </section>

      {/* AXIS CHAMPIONS */}
      <section className="ss">
        <div className="ss-hd"><h3>Axis champions</h3><span>Best on each of the 4 rubric axes (sum across R1–R3, /15)</span></div>
        <div className="stat-quad">
          {AXES.map(a => (
            <div key={a} className="stat-mini">
              <div className="stat-mini-hd">{AXIS_LABEL[a]}</div>
              {axisTop[a].slice(0, 3).map((s, i) => (
                <div key={s.code} className="stat-mini-row">
                  <span className="rk">{i+1}</span>
                  <span className="cd">{s.code}</span>
                  <span className="nm">{s.name || '—'}</span>
                  <span className="pt">{s.axisSum}/15</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* SCORE DISTRIBUTION */}
      <section className="ss">
        <div className="ss-hd"><h3>Score distribution</h3><span>How often each /20 total occurred across all prelim speaker-scores</span></div>
        <Histogram bins={scoreDist} labels={scoreDist.map((_, i) => `${i}`)} />
      </section>

      {/* SIDE WIN RATE */}
      <section className="ss">
        <div className="ss-hd"><h3>Prop vs Opp</h3><span>Which side won more? (Forfeits excluded)</span></div>
        <SideDonut prop={sideWinRate.prop} opp={sideWinRate.opp} />
      </section>

      {/* CLASS LEADERBOARD */}
      <section className="ss">
        <div className="ss-hd"><h3>Class leaderboard</h3><span>Total wins per class (avg score in parentheses)</span></div>
        <BarList items={classStats.map(c => ({
          label: `Class ${c.class}`, value: c.wins, max: Math.max(...classStats.map(x => x.wins)), sub: `avg ${c.avg.toFixed(1)}/20 · ${c.count} scholars`,
        }))} color="#1dafec" />
      </section>

      {/* CLASS MVPs */}
      <section className="ss">
        <div className="ss-hd"><h3>Class MVPs</h3><span>Top scorer from each class</span></div>
        <div className="stat-grid">
          {classMVPs.map(m => (
            <div key={m.class} className="stat-mvp clickable" onClick={() => setDrilldown({ kind: 'scholar', code: m.code })}>
              <div className="stat-mvp-cls">Class {m.class}</div>
              <div className="stat-mvp-code">{m.code}</div>
              <div className="stat-mvp-name">{m.name || '—'}</div>
              <div className="stat-mvp-pts">{m.grandTotal} pts · {m.wins}W</div>
            </div>
          ))}
        </div>
      </section>

      {/* ALL-TOURNAMENT TEAM */}
      <section className="ss">
        <div className="ss-hd"><h3>All-tournament team</h3><span>Top 6 by total points, regardless of class</span></div>
        <div className="stat-grid grid-6">
          {allTournamentTeam.map((s, i) => (
            <div key={s.code} className="stat-mvp accent-gold clickable" onClick={() => setDrilldown({ kind: 'scholar', code: s.code })}>
              <div className="stat-mvp-cls">#{i+1} · Class {s.class}</div>
              <div className="stat-mvp-code">{s.code}</div>
              <div className="stat-mvp-name">{s.name || '—'}</div>
              <div className="stat-mvp-pts">{s.grandTotal} pts</div>
            </div>
          ))}
        </div>
      </section>

      {/* MATCHUP MATRIX */}
      <section className="ss">
        <div className="ss-hd"><h3>Class-vs-class matchup matrix</h3><span>How many prelim rooms had each class combination (Aff × Opp)</span></div>
        <ClassMatrix grid={classMatrix} />
      </section>

      {/* JUDGE SEVERITY — clickable */}
      <section className="ss">
        <div className="ss-hd"><h3>Judge severity</h3><span>Average points a judge awards per speaker · click to drill</span></div>
        <div className="s-bars">
          {judgeStats.slice().sort((a, b) => a.avgScore - b.avgScore).map(j => (
            <div key={j.code} className="s-bar-row clickable" onClick={() => setDrilldown({ kind: 'judge', code: j.code })}>
              <div className="s-bar-lbl"><span>{j.code} · {j.name || '—'}</span></div>
              <div className="s-bar-track">
                <div className="s-bar-fill" style={{ width: `${(j.avgScore / 20) * 100}%`, background: '#efb34a' }} />
              </div>
              <div className="s-bar-val">{j.avgScore.toFixed(2)}<small> · {j.ballots.length} ballots</small></div>
            </div>
          ))}
        </div>
      </section>

      {/* JUDGE LEAN */}
      <section className="ss">
        <div className="ss-hd"><h3>Judge lean</h3><span>Fraction of decisions where they picked Prop (0.5 = balanced)</span></div>
        <BarList items={judgeStats.slice().sort((a, b) => b.propLean - a.propLean).map(j => ({
          label: `${j.code} · ${j.name || '—'}`,
          value: +j.propLean.toFixed(2), max: 1, sub: `${j.propPicks} Prop / ${j.oppPicks} Opp`,
        }))} color="#7c5cff" />
      </section>

      {/* JUDGE FEEDBACK DENSITY */}
      <section className="ss">
        <div className="ss-hd"><h3>Note-writers</h3><span>Judges by average note length (chars) + speech-note fill rate</span></div>
        <BarList items={judgeStats.slice().sort((a, b) => b.avgNoteLen - a.avgNoteLen).slice(0, 15).map(j => ({
          label: `${j.code} · ${j.name || '—'}`,
          value: Math.round(j.avgNoteLen), max: Math.max(...judgeStats.map(x => x.avgNoteLen)) || 1,
          sub: `flow: ${Math.round(j.speechFillRate * 100)}%`,
        }))} color="#2b2c2d" />
      </section>

      {/* MOTION KIND WINRATE */}
      <section className="ss">
        <div className="ss-hd"><h3>Motion kind win rates</h3><span>Did Policy motions favor Prop? Value? Metaphor?</span></div>
        <div className="stat-quad grid-3">
          {['Policy','Value','Metaphor'].map(k => (
            <div key={k} className="stat-mini">
              <div className="stat-mini-hd">{k}</div>
              <div className="stat-motion-row">Prop <b>{kindStats[k].prop}</b></div>
              <div className="stat-motion-row">Opp <b>{kindStats[k].opp}</b></div>
              <div className="stat-motion-row">Avg score <b>{kindStats[k].avgScore.toFixed(1)}/20</b></div>
              <div className="stat-motion-row">Sample n = {kindStats[k].tot}</div>
            </div>
          ))}
        </div>
      </section>

      {/* MOST SURVIVED MOTIONS */}
      <section className="ss">
        <div className="ss-hd"><h3>Motions ranked</h3><span>Most-survived (used in most rooms) at top</span></div>
        <div className="stat-list">
          {motionStats.slice().sort((a, b) => b.survived - a.survived).slice(0, 10).map(m => (
            <div key={m.id} className="stat-motion-card">
              <div className="stat-motion-top">
                <span className="tag" style={{background: m.kind === 'Policy' ? '#1dafec' : m.kind === 'Value' ? '#efb34a' : '#8cc63e'}}>{m.kind}</span>
                <span>{m.roundId}</span>
                <span className="stat-motion-count">{m.survived}× survived</span>
              </div>
              <div className="stat-motion-text">{m.text}</div>
              <div className="stat-motion-foot">avg score {m.avgScore.toFixed(1)} · avg spread {m.avgSpread.toFixed(1)} · Prop {m.propWins} / Opp {m.oppWins}</div>
            </div>
          ))}
        </div>
      </section>

      {/* NEVER SURVIVED MOTIONS */}
      <section className="ss">
        <div className="ss-hd"><h3>Never-survived motions</h3><span>Motions that always got struck</span></div>
        <div className="stat-list">
          {(motions || []).filter(m => PRELIMS.includes(m.round_id) && !motionStats.find(ms => ms.id === m.id)).map(m => (
            <div key={m.id} className="stat-motion-card muted">
              <div className="stat-motion-top">
                <span className="tag" style={{background: m.kind === 'Policy' ? '#1dafec' : m.kind === 'Value' ? '#efb34a' : '#8cc63e'}}>{m.kind}</span>
                <span>{m.round_id}</span>
              </div>
              <div className="stat-motion-text">{m.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ROUND PACING */}
      <section className="ss">
        <div className="ss-hd"><h3>Round-level averages</h3><span>Did quality dip or rise as the day progressed?</span></div>
        <div className="stat-quad">
          {PRELIMS.map(r => {
            const st = roundStats[r]
            return (
              <div key={r} className="stat-mini">
                <div className="stat-mini-hd">{r}</div>
                <div className="stat-motion-row">Ballots <b>{st.ballots}</b></div>
                <div className="stat-motion-row">Avg score <b>{st.avg.toFixed(2)}/20</b></div>
                <div className="stat-motion-row">Avg spread <b>{st.avgSpread.toFixed(2)}</b></div>
                <div className="stat-motion-row">Prop wins <b>{st.propWins}</b> · Opp wins <b>{st.oppWins}</b></div>
                <div className="stat-motion-row">Forfeits <b>{st.forfeits}</b></div>
              </div>
            )
          })}
        </div>
      </section>

      {/* STORY: COMEBACK */}
      <section className="ss">
        <div className="ss-hd"><h3>Comeback of the day</h3><span>Biggest jump from R1 to R3</span></div>
        <BarList items={stories.comebacks.slice(0, 5).map(s => ({
          label: `${s.code} · ${s.name || '—'}`,
          value: s.delta, max: 20, sub: `R1 ${s.rounds.R1?.total} → R3 ${s.rounds.R3?.total}`, badge: s.class,
        }))} color="#8cc63e" />
      </section>

      {/* STORY: CLUTCH */}
      <section className="ss">
        <div className="ss-hd"><h3>Clutch performances</h3><span>Rooms decided by the tightest margins</span></div>
        <div className="stat-list">
          {stories.clutch.map((c, i) => (
            <div key={i} className="stat-clutch-row">
              <span className="stat-clutch-round">{c.round}</span>
              <span>Room #{c.room}</span>
              <span className="stat-clutch-margin">by {c.spread} pt{c.spread === 1 ? '' : 's'}</span>
              <span>{c.winnerCode} beat {c.loserCode} · {c.aff}–{c.opp}</span>
            </div>
          ))}
        </div>
      </section>

      {/* STORY: DOMINATION */}
      <section className="ss">
        <div className="ss-hd"><h3>Domination matches</h3><span>Biggest total-score gaps (non-forfeit)</span></div>
        <div className="stat-list">
          {stories.domination.map((c, i) => (
            <div key={i} className="stat-clutch-row">
              <span className="stat-clutch-round">{c.round}</span>
              <span>Room #{c.room}</span>
              <span className="stat-clutch-margin domination">gap {c.spread} pts</span>
              <span>{c.winnerCode} demolished {c.loserCode} · {c.aff}–{c.opp}</span>
            </div>
          ))}
        </div>
      </section>

      {/* STORY: BEST SINGLE-ROUND */}
      <section className="ss">
        <div className="ss-hd"><h3>Best single-round performances</h3><span>Highest /20 in one round</span></div>
        <div className="stat-list">
          {stories.bestSingle.map((s, i) => (
            <div key={i} className="stat-clutch-row">
              <span className="stat-clutch-round">{s.round}</span>
              <span>{s.code} · {s.name || '—'}</span>
              <span className="stat-clutch-margin domination">{s.total}/20</span>
              <span>({s.scores.join('/')})</span>
            </div>
          ))}
        </div>
      </section>

      {/* STORY: GRAND SLAMS */}
      {stories.grandSlams.length > 0 && (
        <section className="ss">
          <div className="ss-hd"><h3>Perfect 20s</h3><span>Speakers who scored 5/5/5/5 in a single round</span></div>
          <div className="stat-list">
            {stories.grandSlams.map((s, i) => (
              <div key={i} className="stat-clutch-row">
                <span className="stat-clutch-round">{s.round}</span>
                <span>{s.code} · {s.name || '—'}</span>
                <span className="stat-clutch-margin domination">perfect 20/20</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* STORY: REVERSALS */}
      {stories.reversals.length > 0 && (
        <section className="ss">
          <div className="ss-hd"><h3>Reversal watch</h3><span>Rooms where the winner had fewer total points (judgment call)</span></div>
          <div className="stat-list">
            {stories.reversals.map((c, i) => (
              <div key={i} className="stat-clutch-row">
                <span className="stat-clutch-round">{c.round}</span>
                <span>Room #{c.room}</span>
                <span>{c.winnerCode} won · but pts were {c.aff}–{c.opp}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* STORY: STREAKS */}
      {stories.streaks.length > 0 && (
        <section className="ss">
          <div className="ss-hd"><h3>3-0 sweepers</h3><span>Speakers who won all 3 prelim rounds</span></div>
          <div className="stat-list">
            {stories.streaks.map((s, i) => (
              <div key={i} className="stat-clutch-row">
                <span className="stat-clutch-round">3-0</span>
                <span>{s.code} · {s.name || '—'}</span>
                <span>{s.grandTotal} pts</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* STORY: SHOULD-HAVE-BEEN */}
      <section className="ss">
        <div className="ss-hd"><h3>Should-have-been-champion</h3><span>Highest cumulative points who didn't make the final</span></div>
        <div className="stat-list">
          {stories.shouldHave.map((s, i) => (
            <div key={i} className="stat-clutch-row">
              <span className="stat-clutch-round">#{i+1}</span>
              <span>{s.code} · {s.name || '—'}</span>
              <span className="stat-clutch-margin">{s.grandTotal} pts · {s.wins}W</span>
            </div>
          ))}
        </div>
      </section>

      {/* CHAMPION JOURNEY */}
      {championJourney && (
        <section className="ss">
          <div className="ss-hd"><h3>Champion's path</h3><span>{championJourney.champCode} · {nameByCode[championJourney.champCode] || '—'}</span></div>
          <JourneyTimeline steps={championJourney.champ} />
        </section>
      )}
      {championJourney && (
        <section className="ss">
          <div className="ss-hd"><h3>Runner-up's path</h3><span>{championJourney.runnerCode} · {nameByCode[championJourney.runnerCode] || '—'}</span></div>
          <JourneyTimeline steps={championJourney.runner} />
        </section>
      )}

      {/* SEMI + FINAL VOTES */}
      <section className="ss">
        <div className="ss-hd"><h3>Panel voting results</h3><span>Semi (15-judge panels) + Final (30-judge panel)</span></div>
        <div className="stat-quad grid-3">
          <div className="stat-mini">
            <div className="stat-mini-hd">Semi 1 · Panel A</div>
            <div className="stat-motion-row">Prop <b>{semiStats.rooms[1]?.aff || 0}</b></div>
            <div className="stat-motion-row">Opp <b>{semiStats.rooms[1]?.opp || 0}</b></div>
            <div className="stat-motion-row">Gap <b>{semiStats.rooms[1]?.gap || 0}</b></div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-hd">Semi 2 · Panel B</div>
            <div className="stat-motion-row">Prop <b>{semiStats.rooms[2]?.aff || 0}</b></div>
            <div className="stat-motion-row">Opp <b>{semiStats.rooms[2]?.opp || 0}</b></div>
            <div className="stat-motion-row">Gap <b>{semiStats.rooms[2]?.gap || 0}</b></div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-hd">Final · Panel of 30</div>
            <div className="stat-motion-row">Prop <b>{semiStats.final.aff}</b></div>
            <div className="stat-motion-row">Opp <b>{semiStats.final.opp}</b></div>
            <div className="stat-motion-row">Gap <b>{semiStats.final.gap}</b></div>
          </div>
        </div>
      </section>

      {/* CONTENT STATS */}
      <section className="ss">
        <div className="ss-hd"><h3>Content produced</h3><span>Judge notes, speech notes, total words</span></div>
        <div className="stat-row">
          <StatCard k="Words in notes" v={contentStats.totalWords} sub="4+ char words" />
          <StatCard k="Notes to speakers" v={contentStats.totalNotes} sub={`avg ${contentStats.noteLenAvg.toFixed(0)} chars`} />
          <StatCard k="Speech notes" v={contentStats.totalSpeechNotes} sub="prop-const, opp-open, etc." />
        </div>
        {contentStats.topWords.length > 0 && (
          <div className="stat-word-cloud">
            {contentStats.topWords.map(([w, n]) => (
              <span key={w} className="wc" style={{ fontSize: `${12 + Math.min(28, n * 1.5)}px` }}>{w}<sup>{n}</sup></span>
            ))}
          </div>
        )}
        {contentStats.longestNote && (
          <div className="stat-best-line">
            <span className="dp-note-label">Longest one-liner</span>
            <div className="dp-note">"{contentStats.longestNote}"</div>
          </div>
        )}
      </section>

      {/* V2 ADDITIONS */}

      {/* PER-SPEAKER PROP vs OPP BALANCE */}
      <section className="ss">
        <div className="ss-hd"><h3>Prop vs Opp balance</h3><span>How often each top-10 speaker debated Prop vs Opp — did the draw favor anyone?</span></div>
        <BarList items={top10Total.slice(0, 10).map(s => ({
          label: `${s.code} · ${s.name || '—'}`,
          value: s.propRounds,
          max: s.propRounds + s.oppRounds,
          sub: `${s.propRounds} Prop / ${s.oppRounds} Opp`,
        }))} color="#1dafec" />
      </section>

      {/* CONSISTENCY INDEX (stddev) */}
      <section className="ss">
        <div className="ss-hd"><h3>Steadiest speakers</h3><span>Lowest score variance across R1–R3 (top 10 by total, sorted by consistency)</span></div>
        <BarList items={top10Total.slice().sort((a, b) => a.stddev - b.stddev).map(s => ({
          label: `${s.code} · ${s.name || '—'}`,
          value: +s.stddev.toFixed(2),
          max: Math.max(...top10Total.map(x => x.stddev)) || 1,
          sub: `avg ${s.avg.toFixed(1)}/20 · rounds: ${s.trajectory.map(t => t ?? '—').join('/')}`,
        }))} color="#7c5cff" />
      </section>

      {/* POINT SPREAD DISTRIBUTION */}
      <section className="ss">
        <div className="ss-hd"><h3>Room-margin distribution</h3><span>How lopsided were prelim rooms? (spread = |Prop – Opp|)</span></div>
        {(() => {
          const bins = new Array(21).fill(0)
          for (const b of prelimBallots) {
            const aff = AXES.reduce((s, a) => s + (b[`aff_${a}`] || 0), 0)
            const opp = AXES.reduce((s, a) => s + (b[`opp_${a}`] || 0), 0)
            bins[Math.abs(aff - opp)]++
          }
          return <Histogram bins={bins} labels={bins.map((_, i) => `${i}`)} />
        })()}
      </section>

      {/* PANEL A vs B ALIGNMENT */}
      <section className="ss">
        <div className="ss-hd"><h3>Panel A vs Panel B alignment</h3><span>Did both semi panels vote the same side, or diverge?</span></div>
        {(() => {
          const a = semiStats.rooms[1]
          const b = semiStats.rooms[2]
          const aWinner = a ? (a.aff > a.opp ? 'Prop' : 'Opp') : '—'
          const bWinner = b ? (b.aff > b.opp ? 'Prop' : 'Opp') : '—'
          const aligned = aWinner === bWinner
          return (
            <div className="stat-quad grid-3">
              <div className="stat-mini">
                <div className="stat-mini-hd">Panel A picked</div>
                <div className="stat-motion-row"><b>{aWinner}</b> {a && `(${Math.max(a.aff, a.opp)}–${Math.min(a.aff, a.opp)})`}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-mini-hd">Panel B picked</div>
                <div className="stat-motion-row"><b>{bWinner}</b> {b && `(${Math.max(b.aff, b.opp)}–${Math.min(b.aff, b.opp)})`}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-mini-hd">Alignment</div>
                <div className="stat-motion-row"><b>{aligned ? 'Same side' : 'Split'}</b></div>
                <div className="stat-motion-row">
                  {aligned ? 'Both panels leaned the same way' : 'Panels disagreed on which side was stronger'}
                </div>
              </div>
            </div>
          )
        })()}
      </section>

      {/* PEAK ROUND */}
      <section className="ss">
        <div className="ss-hd"><h3>Peak-performance round</h3><span>Which round each of the top 10 scored their highest</span></div>
        <div className="stat-list">
          {top10Total.map(s => {
            const peak = PRELIMS.reduce((best, r) => {
              const t = s.rounds[r]?.total ?? -1
              return t > (best.t ?? -1) ? { r, t } : best
            }, { r: '—', t: null })
            return (
              <div key={s.code} className="stat-clutch-row">
                <span className="stat-clutch-round">{peak.r}</span>
                <span>{s.code} · {s.name || '—'}</span>
                <span className="stat-clutch-margin domination">{peak.t ?? '—'}/20</span>
                <span>rounds: {s.trajectory.map(x => x ?? '—').join(' / ')}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* AXIS SPECIALISTS */}
      <section className="ss">
        <div className="ss-hd"><h3>Axis specialists</h3><span>Speakers with highest variance across the 4 axes — a signature strength</span></div>
        <div className="stat-list">
          {scholarList.map(s => {
            const totals = AXES.map(a => s.perAxis[a].reduce((x, y) => x + y, 0))
            const max = Math.max(...totals)
            const min = Math.min(...totals)
            const bestAxisIdx = totals.indexOf(max)
            return { ...s, axisTotals: totals, spread: max - min, best: AXES[bestAxisIdx] }
          }).sort((a, b) => b.spread - a.spread).slice(0, 5).map(s => (
            <div key={s.code} className="stat-clutch-row">
              <span className="stat-clutch-round">{AXIS_LABEL[s.best]}</span>
              <span>{s.code} · {s.name || '—'}</span>
              <span className="stat-clutch-margin domination">Δ {s.spread} pts</span>
              <span>Arg {s.axisTotals[0]} · Reb {s.axisTotals[1]} · Del {s.axisTotals[2]} · Per {s.axisTotals[3]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 5s CLUB */}
      <section className="ss">
        <div className="ss-hd"><h3>The 5s club</h3><span>Speakers who scored a 5 on at least one axis in any round</span></div>
        <div className="stat-list">
          {scholarList.map(s => {
            const fivesCount = Object.values(s.rounds).reduce((n, r) => n + r.scores.filter(x => x === 5).length, 0)
            return { ...s, fivesCount }
          }).filter(s => s.fivesCount > 0).sort((a, b) => b.fivesCount - a.fivesCount).slice(0, 10).map(s => (
            <div key={s.code} className="stat-clutch-row">
              <span className="stat-clutch-round">×{s.fivesCount}</span>
              <span>{s.code} · {s.name || '—'}</span>
              <span className="stat-clutch-margin domination">{s.fivesCount} five{s.fivesCount === 1 ? '' : 's'}</span>
              <span>{s.wins}W · {s.grandTotal} pts</span>
            </div>
          ))}
        </div>
      </section>

      {/* RELIABILITY (never below 12) */}
      <section className="ss">
        <div className="ss-hd"><h3>The reliable ones</h3><span>Speakers who never scored below 12/20 in any round</span></div>
        <div className="stat-list">
          {scholarList.filter(s => s.totals.length >= 3 && s.totals.every(t => t >= 12)).sort((a, b) => Math.min(...b.totals) - Math.min(...a.totals) || b.grandTotal - a.grandTotal).map(s => (
            <div key={s.code} className="stat-clutch-row">
              <span className="stat-clutch-round">floor {Math.min(...s.totals)}</span>
              <span>{s.code} · {s.name || '—'}</span>
              <span className="stat-clutch-margin domination">{s.grandTotal} pts</span>
              <span>rounds: {s.trajectory.join(' / ')}</span>
            </div>
          ))}
        </div>
      </section>

      {/* JUDGE RANGE & INFLATION */}
      <section className="ss">
        <div className="ss-hd"><h3>Judge range + inflation</h3><span>Range = high – low ballot spread · Inflation = avg vs tournament avg</span></div>
        {(() => {
          const tournamentAvg = judgeStats.length ? judgeStats.reduce((s, j) => s + j.avgScore, 0) / judgeStats.length : 0
          return (
            <div className="stat-list">
              {judgeStats.slice().sort((a, b) => Math.abs(b.avgScore - tournamentAvg) - Math.abs(a.avgScore - tournamentAvg)).slice(0, 10).map(j => (
                <div key={j.code} className="stat-clutch-row">
                  <span className="stat-clutch-round">{j.code}</span>
                  <span>{j.name || '—'}</span>
                  <span className="stat-clutch-margin domination">Δ {(j.avgScore - tournamentAvg > 0 ? '+' : '')}{(j.avgScore - tournamentAvg).toFixed(2)}</span>
                  <span>range {j.range} · avg spread {j.avgSpread.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )
        })()}
      </section>

      {/* WINNER-PICKER ACCURACY */}
      <section className="ss">
        <div className="ss-hd"><h3>Winner-picker consistency</h3><span>Did the judge's chosen winner also have the higher point total? Should be near 100%</span></div>
        <BarList items={judgeStats.map(j => {
          const matches = j.ballots.filter(x => !x.forfeit && ((x.affTotal > x.oppTotal && x.winner === 'aff') || (x.oppTotal > x.affTotal && x.winner === 'opp'))).length
          const nonForfeit = j.ballots.filter(x => !x.forfeit && x.affTotal !== x.oppTotal).length
          const pct = nonForfeit ? matches / nonForfeit : 1
          return { label: `${j.code} · ${j.name || '—'}`, value: +(pct * 100).toFixed(0), max: 100, sub: `${matches}/${nonForfeit} decisive` }
        }).sort((a, b) => a.value - b.value)} color="#efb34a" />
      </section>

      {/* CLASS BALANCE (within-class variance) */}
      <section className="ss">
        <div className="ss-hd"><h3>Class balance</h3><span>Within-class spread — was the class carried by one star or evenly matched?</span></div>
        <BarList items={classStats.map(c => {
          const codes = scholarList.filter(s => s.class === c.class).map(s => s.grandTotal)
          const avg = codes.length ? codes.reduce((s, n) => s + n, 0) / codes.length : 0
          const stddev = codes.length > 1 ? Math.sqrt(codes.map(v => (v - avg) ** 2).reduce((s, n) => s + n, 0) / codes.length) : 0
          return { label: `Class ${c.class}`, value: +stddev.toFixed(1), max: 20, sub: `avg ${avg.toFixed(1)} · min ${Math.min(...codes)} · max ${Math.max(...codes)}` }
        }).sort((a, b) => a.value - b.value)} color="#7c5cff" />
      </section>

      {/* CLASS SIDE-WINS */}
      <section className="ss">
        <div className="ss-hd"><h3>Class wins by side</h3><span>Which classes were stronger as Prop vs Opp</span></div>
        {(() => {
          const cs = {}
          for (const b of prelimBallots) {
            const pair = prelimPairings.find(p => p.round_id === b.round_id && p.room === b.room)
            if (!pair) continue
            const winnerCls = classOf(b.winner === 'aff' ? pair.aff_code : pair.opp_code)
            cs[winnerCls] ||= { cls: winnerCls, prop: 0, opp: 0 }
            if (b.winner === 'aff') cs[winnerCls].prop++
            else if (b.winner === 'opp') cs[winnerCls].opp++
          }
          return (
            <div className="stat-list">
              {Object.values(cs).sort((a, b) => (b.prop + b.opp) - (a.prop + a.opp)).map(c => (
                <div key={c.cls} className="stat-clutch-row">
                  <span className="stat-clutch-round">Class {c.cls}</span>
                  <span>{c.prop + c.opp} total wins</span>
                  <span className="stat-clutch-margin domination">Prop {c.prop} · Opp {c.opp}</span>
                  <span>{c.prop > c.opp ? `stronger on Prop (+${c.prop - c.opp})` : c.opp > c.prop ? `stronger on Opp (+${c.opp - c.prop})` : 'balanced'}</span>
                </div>
              ))}
            </div>
          )
        })()}
      </section>

      {/* BEST DEBATER NOT FROM WINNING CLASS */}
      <section className="ss">
        <div className="ss-hd"><h3>Best debater outside the top class</h3><span>Star speakers whose class didn't top the standings</span></div>
        {(() => {
          const topClass = classStats[0]?.class
          const outsiders = scholarList.filter(s => s.class !== topClass).sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 5)
          return (
            <div className="stat-list">
              {outsiders.map((s, i) => (
                <div key={s.code} className="stat-clutch-row">
                  <span className="stat-clutch-round">#{i+1}</span>
                  <span>{s.code} · {s.name || '—'}</span>
                  <span className="stat-clutch-margin domination">{s.grandTotal} pts</span>
                  <span>Class {s.class} · {s.wins}W</span>
                </div>
              ))}
            </div>
          )
        })()}
      </section>

      {/* HIGHEST TOTAL ROOM + BIGGEST SINGLE-ROOM SPREAD (already domination) */}
      <section className="ss">
        <div className="ss-hd"><h3>Highest-scoring rooms</h3><span>Total combined /40 (both speakers) — the debates that lit up</span></div>
        <div className="stat-list">
          {prelimBallots.map(b => {
            const pair = prelimPairings.find(p => p.round_id === b.round_id && p.room === b.room)
            const aff = AXES.reduce((s, a) => s + (b[`aff_${a}`] || 0), 0)
            const opp = AXES.reduce((s, a) => s + (b[`opp_${a}`] || 0), 0)
            return { round: b.round_id, room: b.room, total: aff + opp, aff, opp, aff_code: pair?.aff_code, opp_code: pair?.opp_code, forfeit: !!b.forfeit_side }
          }).filter(x => !x.forfeit).sort((a, b) => b.total - a.total).slice(0, 5).map((r, i) => (
            <div key={i} className="stat-clutch-row">
              <span className="stat-clutch-round">{r.round}</span>
              <span>Room #{r.room}</span>
              <span className="stat-clutch-margin domination">{r.total}/40</span>
              <span>{r.aff_code} ({r.aff}) vs {r.opp_code} ({r.opp})</span>
            </div>
          ))}
        </div>
      </section>

      {/* CX KILLER (Rebuttal specialists) */}
      <section className="ss">
        <div className="ss-hd"><h3>CX killers</h3><span>Best Rebuttal &amp; CX totals across R1–R3</span></div>
        <BarList items={axisTop.rebuttal.map(s => ({
          label: `${s.code} · ${s.name || '—'}`,
          value: s.axisSum, max: 15, sub: `Class ${s.class}`,
        }))} color="#b23" />
      </section>

      {/* UNDERDOG (few wins, high total) */}
      <section className="ss">
        <div className="ss-hd"><h3>Underdogs</h3><span>High point-totals but low wins — good arguments, hard luck</span></div>
        {(() => {
          const meanTotal = scholarList.length ? scholarList.reduce((s, sp) => s + sp.grandTotal, 0) / scholarList.length : 0
          return (
            <div className="stat-list">
              {scholarList.filter(s => s.grandTotal >= meanTotal && s.wins <= 1).sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 5).map((s, i) => (
                <div key={s.code} className="stat-clutch-row">
                  <span className="stat-clutch-round">#{i+1}</span>
                  <span>{s.code} · {s.name || '—'}</span>
                  <span className="stat-clutch-margin domination">{s.grandTotal} pts</span>
                  <span>only {s.wins}W · {s.losses}L</span>
                </div>
              ))}
            </div>
          )
        })()}
      </section>

      {/* FIRST-ROUND JITTERS */}
      <section className="ss">
        <div className="ss-hd"><h3>First-round jitters</h3><span>Low R1 (bottom-third), but recovered by R3</span></div>
        {(() => {
          const r1Sorted = scholarList.filter(s => s.rounds.R1).map(s => s.rounds.R1.total).sort((a, b) => a - b)
          const jitterThreshold = r1Sorted[Math.floor(r1Sorted.length / 3)] || 0
          return (
            <div className="stat-list">
              {scholarList.filter(s => s.rounds.R1 && s.rounds.R3 && s.rounds.R1.total <= jitterThreshold && s.rounds.R3.total > s.rounds.R1.total)
                .sort((a, b) => (b.rounds.R3.total - b.rounds.R1.total) - (a.rounds.R3.total - a.rounds.R1.total)).slice(0, 5).map(s => (
                  <div key={s.code} className="stat-clutch-row">
                    <span className="stat-clutch-round">R1→R3</span>
                    <span>{s.code} · {s.name || '—'}</span>
                    <span className="stat-clutch-margin domination">+{s.rounds.R3.total - s.rounds.R1.total} pts</span>
                    <span>R1 {s.rounds.R1.total} → R3 {s.rounds.R3.total}</span>
                  </div>
                ))}
            </div>
          )
        })()}
      </section>

      {/* BRACKET-BREAKER */}
      <section className="ss">
        <div className="ss-hd"><h3>Bracket check</h3><span>Did the top-4-by-points make R4? And who made the final?</span></div>
        {(() => {
          const top4 = scholarList.slice().sort((a, b) => b.wins - a.wins || b.grandTotal - a.grandTotal).slice(0, 4).map(s => s.code)
          const r4Codes = (pairings || []).filter(p => p.round_id === 'R4').flatMap(p => [p.aff_code, p.opp_code])
          const r5Codes = (pairings || []).filter(p => p.round_id === 'R5').flatMap(p => [p.aff_code, p.opp_code])
          const brokeIn = r4Codes.filter(c => !top4.includes(c))
          const missedOut = top4.filter(c => !r4Codes.includes(c))
          return (
            <div className="stat-quad grid-3">
              <div className="stat-mini">
                <div className="stat-mini-hd">Top-4 by prelims</div>
                {top4.map(c => <div key={c} className="stat-motion-row">{c} · {nameByCode[c] || '—'}</div>)}
              </div>
              <div className="stat-mini">
                <div className="stat-mini-hd">Actually made R4</div>
                {r4Codes.map((c, i) => <div key={i} className="stat-motion-row">{c} · {nameByCode[c] || '—'}</div>)}
                {brokeIn.length > 0 && <div className="stat-motion-row" style={{color: '#b23'}}>Bracket-breakers: {brokeIn.join(', ')}</div>}
                {missedOut.length > 0 && <div className="stat-motion-row" style={{color: '#b23'}}>Missed out: {missedOut.join(', ')}</div>}
              </div>
              <div className="stat-mini">
                <div className="stat-mini-hd">Made the Final</div>
                {r5Codes.map((c, i) => <div key={i} className="stat-motion-row"><b>{c}</b> · {nameByCode[c] || '—'}</div>)}
              </div>
            </div>
          )
        })()}
      </section>

      {/* MOTION TIGHTEST DEBATE */}
      <section className="ss">
        <div className="ss-hd"><h3>Tightest &amp; spiciest motions</h3><span>By avg |Prop – Opp| score gap — smallest = closest debates</span></div>
        <div className="stat-quad grid-3">
          <div className="stat-mini">
            <div className="stat-mini-hd">Tightest 3</div>
            {motionStats.slice().sort((a, b) => a.avgSpread - b.avgSpread).slice(0, 3).map(m => (
              <div key={m.id} className="stat-motion-row" title={m.text}><b>{m.kind}</b> · gap {m.avgSpread.toFixed(1)}</div>
            ))}
          </div>
          <div className="stat-mini">
            <div className="stat-mini-hd">Most one-sided 3</div>
            {motionStats.slice().sort((a, b) => b.avgSpread - a.avgSpread).slice(0, 3).map(m => (
              <div key={m.id} className="stat-motion-row" title={m.text}><b>{m.kind}</b> · gap {m.avgSpread.toFixed(1)}</div>
            ))}
          </div>
          <div className="stat-mini">
            <div className="stat-mini-hd">Highest-scoring 3</div>
            {motionStats.slice().sort((a, b) => b.avgScore - a.avgScore).slice(0, 3).map(m => (
              <div key={m.id} className="stat-motion-row" title={m.text}><b>{m.kind}</b> · avg {m.avgScore.toFixed(1)}</div>
            ))}
          </div>
        </div>
      </section>

      {/* JUDGE DRAMA */}
      <section className="ss">
        <div className="ss-hd"><h3>Judges who saw the most drama</h3><span>Highest score variance across their rooms — swings of judgment</span></div>
        <BarList items={judgeStats.slice().sort((a, b) => b.avgSpread - a.avgSpread).slice(0, 10).map(j => ({
          label: `${j.code} · ${j.name || '—'}`,
          value: +j.avgSpread.toFixed(2),
          max: Math.max(...judgeStats.map(x => x.avgSpread)) || 1,
          sub: `range ${j.range} · ${j.ballots.length} rooms`,
        }))} color="#b23" />
      </section>

      {/* CLASS CONTRIBUTION TO BRACKET */}
      <section className="ss">
        <div className="ss-hd"><h3>Class contribution to the bracket</h3><span>How many R4 quarterfinalists came from each class</span></div>
        {(() => {
          const r4Codes = (pairings || []).filter(p => p.round_id === 'R4').flatMap(p => [p.aff_code, p.opp_code])
          const contribs = {}
          for (const code of r4Codes) contribs[classOf(code)] = (contribs[classOf(code)] || 0) + 1
          return (
            <BarList items={Object.entries(contribs).sort((a, b) => b[1] - a[1]).map(([cls, n]) => ({
              label: `Class ${cls}`,
              value: n, max: 4, sub: `${n} of 4 spots`,
            }))} color="#8cc63e" />
          )
        })()}
      </section>

      {/* AUTO-GENERATED HEADLINES */}
      <section className="ss">
        <div className="ss-hd"><h3>Auto-generated headlines</h3><span>Copy-paste for the recap deck or social</span></div>
        <div className="stat-list">
          {(() => {
            const lines = []
            if (top10Total[0]) lines.push(`🏆 ${top10Total[0].name || top10Total[0].code} tops the prelims with ${top10Total[0].grandTotal} points across ${top10Total[0].wins} wins.`)
            if (stories.comebacks[0] && stories.comebacks[0].delta > 0) lines.push(`📈 Comeback of the day: ${stories.comebacks[0].name || stories.comebacks[0].code} swung ${stories.comebacks[0].rounds.R1.total} → ${stories.comebacks[0].rounds.R3.total} across three rounds.`)
            if (stories.clutch[0]) lines.push(`⚡ Tightest room of the day: R${stories.clutch[0].round.slice(1)} Room #${stories.clutch[0].room}, ${stories.clutch[0].winnerCode} edged ${stories.clutch[0].loserCode} by ${stories.clutch[0].spread} point${stories.clutch[0].spread === 1 ? '' : 's'}.`)
            if (stories.domination[0]) lines.push(`💥 Biggest gap: R${stories.domination[0].round.slice(1)} Room #${stories.domination[0].room}, ${stories.domination[0].winnerCode} vs ${stories.domination[0].loserCode} split ${stories.domination[0].spread} points.`)
            if (classStats[0]) lines.push(`🥇 Class ${classStats[0].class} led all classes with ${classStats[0].wins} wins and an average speaker score of ${classStats[0].avg.toFixed(1)}/20.`)
            if (stories.grandSlams.length > 0) lines.push(`🎯 ${stories.grandSlams.length} perfect 20/20 score${stories.grandSlams.length === 1 ? '' : 's'} recorded across R1–R3.`)
            if (championJourney) lines.push(`👑 Final: ${championJourney.champCode} · ${nameByCode[championJourney.champCode] || '—'} defeated ${championJourney.runnerCode} · ${nameByCode[championJourney.runnerCode] || '—'} — ${semiStats.final.aff}–${semiStats.final.opp} panel decision.`)
            if (sideWinRate.total > 0) lines.push(`⚖️ Prop won ${sideWinRate.prop}/${sideWinRate.total} (${Math.round((sideWinRate.prop / sideWinRate.total) * 100)}%) of prelim rooms — ${sideWinRate.prop > sideWinRate.opp ? 'a Prop-friendly day' : sideWinRate.opp > sideWinRate.prop ? 'an Opp-friendly day' : 'perfectly split'}.`)
            return lines.map((l, i) => (
              <div key={i} className="stat-motion-card">
                <div className="stat-motion-text" style={{fontFamily: '"Open Sans", sans-serif', fontStyle: 'normal', fontSize: 14}}>{l}</div>
              </div>
            ))
          })()}
        </div>
      </section>

      {/* CLASS RECAPS */}
      <section className="ss">
        <div className="ss-hd"><h3>Class recap paragraphs</h3><span>One paragraph per class</span></div>
        <div className="stat-list">
          {classStats.map(c => {
            const mvp = classMVPs.find(m => m.class === c.class)
            const contribCodes = (pairings || []).filter(p => p.round_id === 'R4').flatMap(p => [p.aff_code, p.opp_code]).filter(code => classOf(code) === c.class)
            return (
              <div key={c.class} className="stat-motion-card">
                <div className="stat-motion-top">
                  <span className="tag" style={{background: '#2b2c2d'}}>Class {c.class}</span>
                  <span>{c.count} scholars · {c.wins} wins · avg {c.avg.toFixed(1)}/20</span>
                </div>
                <div className="stat-motion-text" style={{fontFamily: '"Open Sans", sans-serif', fontStyle: 'normal', fontSize: 14, lineHeight: 1.55}}>
                  Class {c.class} logged {c.wins} prelim wins with an average speaker score of {c.avg.toFixed(1)}/20 across {c.ballotsCount} ballots. {mvp && `${mvp.name || mvp.code} led the way with ${mvp.grandTotal} points and ${mvp.wins} wins.`}{contribCodes.length > 0 ? ` The class sent ${contribCodes.length} debater${contribCodes.length === 1 ? '' : 's'} into the quarterfinal bracket (${contribCodes.join(', ')}).` : ' No debaters advanced to the quarterfinal bracket.'}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* CHART VARIETY */}

      {/* RADAR — axis profiles of top 5 */}
      <section className="ss">
        <div className="ss-hd"><h3>Axis profile radar</h3><span>The 4-axis shape of each top-5 scholar — see who's balanced vs specialized</span></div>
        {(() => {
          const colors = ['#8cc63e','#1dafec','#efb34a','#7c5cff','#b23']
          const series = top10Total.slice(0, 5).map((s, i) => ({
            label: `${s.code} · ${s.name || '—'}`,
            subLabel: `${s.grandTotal} pts`,
            values: AXES.map(a => s.perAxis[a].reduce((sum, n) => sum + n, 0)),
            color: colors[i],
          }))
          return <Radar series={series} axesLabels={AXES.map(a => AXIS_LABEL[a])} max={15} />
        })()}
      </section>

      {/* LINE — top 10 trajectory across R1/R2/R3 */}
      <section className="ss">
        <div className="ss-hd"><h3>Top-10 trajectory</h3><span>Round-by-round /20 totals — who peaked, who tanked</span></div>
        {(() => {
          const colors = ['#8cc63e','#1dafec','#efb34a','#7c5cff','#b23','#2b2c2d','#a67628','#1189c1','#7ab332','#e91e63']
          const series = top10Total.map((s, i) => ({
            label: `${s.code}`,
            values: PRELIMS.map(r => s.rounds[r]?.total ?? null),
            color: colors[i % colors.length],
          }))
          return <LineChart series={series} xLabels={PRELIMS} yMax={20} />
        })()}
      </section>

      {/* SCATTER — wins vs total points */}
      <section className="ss">
        <div className="ss-hd"><h3>Wins vs points scatter</h3><span>Each dot = one scholar. Colored by class. Top-right = dominant; bottom-right = high points, no wins</span></div>
        {(() => {
          const cc = { A: '#8cc63e', B: '#1dafec', C: '#efb34a', D: '#7c5cff', E: '#b23', F: '#2b2c2d' }
          const points = scholarList.map(s => ({
            x: s.wins, y: s.grandTotal, color: cc[s.class] || '#999',
            label: `${s.code} · ${s.name || '—'}`,
          }))
          return (
            <>
              <Scatter points={points} xMax={3} yMax={60} xLabel="Wins (R1–R3)" yLabel="Total points" />
              <div className="s-donut-legend" style={{marginTop: 8}}>
                {Object.entries(cc).map(([cls, col]) => (
                  <div key={cls}><span className="chip" style={{background: col}} />Class {cls}</div>
                ))}
              </div>
            </>
          )
        })()}
      </section>

      {/* STACKED BAR — class wins by side */}
      <section className="ss">
        <div className="ss-hd"><h3>Class wins by side (stacked)</h3><span>Blue = wins as Prop · Orange = wins as Opp</span></div>
        {(() => {
          const cs = {}
          for (const b of prelimBallots) {
            const pair = prelimPairings.find(p => p.round_id === b.round_id && p.room === b.room)
            if (!pair) continue
            const winnerCode = b.winner === 'aff' ? pair.aff_code : pair.opp_code
            if (!winnerCode) continue
            const cls = classOf(winnerCode)
            cs[cls] ||= { prop: 0, opp: 0 }
            if (b.winner === 'aff') cs[cls].prop++
            else if (b.winner === 'opp') cs[cls].opp++
          }
          const groups = ['A','B','C','D','E','F'].map(cls => ({
            label: `Class ${cls}`,
            segments: [
              { value: cs[cls]?.prop || 0, color: '#1dafec', label: 'Prop wins' },
              { value: cs[cls]?.opp || 0, color: '#efb34a', label: 'Opp wins' },
            ],
          }))
          return <StackedBar groups={groups} />
        })()}
      </section>

      {/* SPARKLINE table — trajectory column */}
      <section className="ss">
        <div className="ss-hd"><h3>Top 10 with sparkline trends</h3><span>Inline round-by-round trend — up, flat, or down</span></div>
        <table className="fmt-table">
          <thead><tr><th>Rank</th><th>Code</th><th>Name</th><th>R1 → R2 → R3</th><th>Trend</th><th>Total</th></tr></thead>
          <tbody>
            {top10Total.map((s, i) => (
              <tr key={s.code} className="tr-clickable" onClick={() => setDrilldown({ kind: 'scholar', code: s.code })}>
                <td className="rank">{i + 1}</td>
                <td className="seg">{s.code}</td>
                <td>{s.name || '—'}</td>
                <td>{s.trajectory.map(v => v ?? '—').join(' · ')}</td>
                <td><Sparkline values={s.trajectory} max={20} color={s.trajectory[2] > s.trajectory[0] ? '#8cc63e' : s.trajectory[2] < s.trajectory[0] ? '#b23' : '#7c5cff'} /></td>
                <td><b>{s.grandTotal}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* RADAR — judge severity vs consistency (single-radar with 2 series) */}
      <section className="ss">
        <div className="ss-hd"><h3>Judge fingerprints (radar)</h3><span>Top-5 judges by activity, plotted on 4 dimensions</span></div>
        {(() => {
          const top5 = judgeStats.slice().sort((a, b) => b.ballots.length - a.ballots.length).slice(0, 5)
          const colors = ['#8cc63e','#1dafec','#efb34a','#7c5cff','#b23']
          const maxSeverity = 20
          const maxRange = 20
          const maxLean = 1
          const maxNote = Math.max(1, ...judgeStats.map(j => j.avgNoteLen))
          const scale = (v, m) => (v / m) * 15
          const series = top5.map((j, i) => ({
            label: `${j.code}`,
            subLabel: `${j.ballots.length} rooms`,
            values: [
              scale(j.avgScore, maxSeverity),
              scale(j.range, maxRange),
              scale(j.propLean, maxLean),
              scale(j.avgNoteLen, maxNote),
            ],
            color: colors[i],
          }))
          return <Radar series={series} axesLabels={['Severity','Range','Prop lean','Note density']} max={15} />
        })()}
      </section>

      <section className="ss ss-footnote">
        <div className="ss-hd"><h3>Meta</h3></div>
        <p>All stats computed client-side from live data. Some ideas from the brainstorm require data we didn't log (actual prep-time used, ballot submission timestamps precise to seconds, year-of-study per scholar) — those are the ones missing here. Ping me if you want to add tracking for next year.</p>
      </section>
    </div>
  )
}

/* ---------------- STATS PRIMITIVES ---------------- */
function StatCard({ k, v, sub }) {
  return <div className="s-card"><div className="s-k">{k}</div><div className="s-v">{v}</div>{sub && <div className="s-s">{sub}</div>}</div>
}
function BarList({ items, color = '#8cc63e' }) {
  const max = Math.max(1, ...items.map(x => x.max || x.value))
  return (
    <div className="s-bars">
      {items.map((x, i) => (
        <div key={i} className="s-bar-row">
          <div className="s-bar-lbl">
            <span>{x.label}</span>
            {x.badge && <span className="s-bar-badge">{x.badge}</span>}
          </div>
          <div className="s-bar-track">
            <div className="s-bar-fill" style={{ width: `${(x.value / max) * 100}%`, background: color }} />
          </div>
          <div className="s-bar-val">{x.value}{x.sub && <small> · {x.sub}</small>}</div>
        </div>
      ))}
    </div>
  )
}
function Histogram({ bins, labels }) {
  const max = Math.max(1, ...bins)
  return (
    <div className="s-histo">
      {bins.map((n, i) => (
        <div key={i} className="s-histo-col" title={`${labels[i]}: ${n}`}>
          <div className="s-histo-bar" style={{ height: `${(n / max) * 100}%` }} />
          <div className="s-histo-lbl">{labels[i]}</div>
        </div>
      ))}
    </div>
  )
}
function SideDonut({ prop, opp }) {
  const total = prop + opp || 1
  const p = (prop / total) * 100
  return (
    <div className="s-donut-wrap">
      <div className="s-donut" style={{ background: `conic-gradient(#1dafec 0 ${p}%, #efb34a ${p}% 100%)` }}>
        <div className="s-donut-hole">
          <div><span>{Math.round(p)}%</span><small>Prop</small></div>
        </div>
      </div>
      <div className="s-donut-legend">
        <div><span className="chip aff"></span>Prop won {prop}</div>
        <div><span className="chip opp"></span>Opp won {opp}</div>
      </div>
    </div>
  )
}
function ClassMatrix({ grid }) {
  const classes = ['A','B','C','D','E','F']
  return (
    <table className="s-matrix">
      <thead><tr><th></th>{classes.map(c => <th key={c}>Opp {c}</th>)}</tr></thead>
      <tbody>
        {classes.map(a => (
          <tr key={a}>
            <th>Aff {a}</th>
            {classes.map(o => {
              const n = grid[`${a}-${o}`] || 0
              return <td key={o} style={{ background: `rgba(140,198,62,${Math.min(0.55, n / 6)})` }}>{n || ''}</td>
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
function JourneyTimeline({ steps }) {
  return (
    <div className="s-timeline">
      {steps.map((st, i) => (
        <div key={i} className={`s-tstep ${st.won ? 'won' : ''} ${st.none ? 'none' : ''}`}>
          <div className="s-tround">{st.round}</div>
          {st.none ? <div className="s-tdetail">—</div> : (
            <div className="s-tdetail">
              <div>Room #{st.room} · <b>{st.side === 'aff' ? 'Prop' : 'Opp'}</b> vs {st.oppCode}</div>
              {st.round === 'R4' || st.round === 'R5' ? (
                <div>Panel: <b>{st.panel}</b> for · {st.against} against · {st.won ? 'W' : 'L'}</div>
              ) : (
                <div>{st.myTotal}/20 vs {st.otherTotal}/20 · {st.won ? 'W' : 'L'}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ---------------- DRILLDOWN DRAWER ---------------- */
function DrilldownDrawer({ drilldown, onClose, allowed, nameByCode, pairings, ballots, motions, semiVotes, axes, axisLabel }) {
  const PRELIMS = ['R1','R2','R3']
  const user = allowed.find(u => u.code === drilldown.code)
  const isJudge = drilldown.kind === 'judge' || /^J\d+$/.test(drilldown.code || '')

  const rounds = isJudge
    ? pairings.filter(p => p.judge_code === drilldown.code)
    : pairings.filter(p => p.aff_code === drilldown.code || p.opp_code === drilldown.code)
  const roundsData = rounds.map(p => {
    const b = ballots.find(x => x.round_id === p.round_id && x.room === p.room)
    const motion = motions.find(m => m.id === p.final_motion_id)
    if (!isJudge && b) {
      const side = p.aff_code === drilldown.code ? 'aff' : 'opp'
      const otherSide = side === 'aff' ? 'opp' : 'aff'
      const scores = axes.map(a => b[`${side}_${a}`] || 0)
      const otherScores = axes.map(a => b[`${otherSide}_${a}`] || 0)
      return {
        p, b, motion, side,
        oppCode: side === 'aff' ? p.opp_code : p.aff_code,
        total: scores.reduce((s, n) => s + n, 0),
        otherTotal: otherScores.reduce((s, n) => s + n, 0),
        scores, otherScores,
        won: b.winner === side,
        note: b[`${side}_note`],
        forfeit: b.forfeit_side === side,
        speech_notes: b.speech_notes || {},
      }
    }
    if (isJudge && b) {
      const affScores = axes.map(a => b[`aff_${a}`] || 0)
      const oppScores = axes.map(a => b[`opp_${a}`] || 0)
      return { p, b, motion, affScores, oppScores,
        affTotal: affScores.reduce((s, n) => s + n, 0),
        oppTotal: oppScores.reduce((s, n) => s + n, 0),
        winner: b.winner,
        forfeit: b.forfeit_side,
        aff_note: b.aff_note, opp_note: b.opp_note, speech_notes: b.speech_notes || {},
      }
    }
    return { p, motion, none: true }
  })

  // For semi/final, add votes
  const semiVoteInfo = ['R4','R5'].map(r => {
    if (isJudge) {
      const myVote = semiVotes.find(v => v.judge_code === drilldown.code && v.round_id === r)
      return { round: r, vote: myVote?.vote || null }
    }
    // For scholar: how did panel vote for their room?
    const p = pairings.find(x => x.round_id === r && (x.aff_code === drilldown.code || x.opp_code === drilldown.code))
    if (!p) return { round: r, none: true }
    const side = p.aff_code === drilldown.code ? 'aff' : 'opp'
    const votes = semiVotes.filter(v => v.round_id === r && v.room === p.room)
    const myVotes = votes.filter(v => v.vote === side).length
    const other = votes.filter(v => v.vote !== side).length
    return { round: r, p, side, myVotes, other, won: myVotes > other, oppCode: side === 'aff' ? p.opp_code : p.aff_code }
  })

  return (
    <div className="dd-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dd-drawer">
        <div className="dd-hd">
          <div>
            <span className="kicker">{isJudge ? 'Judge' : 'Scholar'} · drill-down</span>
            <h2>{drilldown.code} · {user?.name || nameByCode[drilldown.code] || '—'}</h2>
            <div className="dd-meta">{user?.email || ''}</div>
          </div>
          <button className="dd-close" onClick={onClose}>×</button>
        </div>

        {!isJudge && (
          <div className="dd-summary">
            {roundsData.filter(r => !r.none && r.b).length > 0 && (
              <>
                <StatCard k="Rounds" v={roundsData.filter(r => !r.none && r.b).length} />
                <StatCard k="Wins" v={roundsData.filter(r => r.won).length} />
                <StatCard k="Total pts" v={roundsData.filter(r => !r.none && r.b).reduce((s, r) => s + r.total, 0)} sub="prelims" />
                <StatCard k="Best round" v={Math.max(...roundsData.filter(r => !r.none && r.b).map(r => r.total))} sub="/20" />
              </>
            )}
          </div>
        )}
        {isJudge && (
          <div className="dd-summary">
            <StatCard k="Ballots" v={roundsData.filter(r => r.b).length} />
            <StatCard k="Prop picks" v={roundsData.filter(r => r.winner === 'aff').length} />
            <StatCard k="Opp picks" v={roundsData.filter(r => r.winner === 'opp').length} />
            <StatCard k="Semi + Final" v={semiVoteInfo.filter(x => x.vote).length} sub="panel votes cast" />
          </div>
        )}

        <div className="dd-scroll">
          {PRELIMS.map(r => {
            const d = roundsData.find(x => x.p?.round_id === r)
            if (!d) return <div key={r} className="dd-round empty">{r} — no assignment</div>
            if (d.none || !d.b) return <div key={r} className="dd-round empty">{r} — Room #{d.p.room} · no ballot submitted</div>
            if (!isJudge) return (
              <div key={r} className={`dd-round ${d.won ? 'won' : 'lost'}`}>
                <div className="dd-round-hd">
                  <span className="dd-r">{r}</span>
                  <span>Room #{d.p.room}</span>
                  <span className={`fp-side ${d.side}`}>{d.side === 'aff' ? 'PROP' : 'OPP'}</span>
                  <span>vs {d.oppCode}</span>
                  <span>Judge {d.p.judge_code}</span>
                  <span className={`fp-result ${d.won ? 'won' : 'lost'}`}>{d.won ? 'W' : 'L'} · {d.total}/20</span>
                </div>
                {d.motion && (
                  <div className="fp-motion">
                    <span className="tag" style={{background: d.motion.kind === 'Policy' ? '#1dafec' : d.motion.kind === 'Value' ? '#efb34a' : '#8cc63e'}}>{d.motion.kind}</span>
                    <span>{d.motion.text}</span>
                  </div>
                )}
                <table className="fmt-table dp-scorecard">
                  <thead><tr><th></th><th>{drilldown.code}</th><th>{d.oppCode}</th></tr></thead>
                  <tbody>
                    {axes.map((a, i) => (
                      <tr key={a}>
                        <td className="axis">{axisLabel[a]}</td>
                        <td className={`score ${d.scores[i] > d.otherScores[i] ? 'higher' : ''}`}>{d.scores[i]}/5</td>
                        <td className={`score ${d.otherScores[i] > d.scores[i] ? 'higher' : ''}`}>{d.otherScores[i]}/5</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td>Total</td><td><b>{d.total}/20</b></td><td><b>{d.otherTotal}/20</b></td>
                    </tr>
                  </tbody>
                </table>
                {d.note && <div className="dp-note-block"><span className="dp-note-label">Judge's note</span><div className="dp-note">"{d.note}"</div></div>}
                {Object.values(d.speech_notes).some(v => v) && (
                  <div className="fp-speech-block">
                    <span className="dp-note-label">Judge's flow (this room)</span>
                    {Object.entries(d.speech_notes).filter(([_, v]) => v).map(([k, v]) => (
                      <div key={k} className="fp-speech-item"><b>{k}</b><span>{v}</span></div>
                    ))}
                  </div>
                )}
              </div>
            )
            return (
              <div key={r} className="dd-round">
                <div className="dd-round-hd">
                  <span className="dd-r">{r}</span>
                  <span>Room #{d.p.room}</span>
                  <span>{d.p.aff_code} vs {d.p.opp_code}</span>
                  <span>Winner: {d.winner === 'aff' ? d.p.aff_code : d.p.opp_code}</span>
                  {d.forfeit && <span className="stat-clutch-margin">Forfeit: {d.forfeit}</span>}
                </div>
                {d.motion && (
                  <div className="fp-motion">
                    <span className="tag" style={{background: d.motion.kind === 'Policy' ? '#1dafec' : d.motion.kind === 'Value' ? '#efb34a' : '#8cc63e'}}>{d.motion.kind}</span>
                    <span>{d.motion.text}</span>
                  </div>
                )}
                <table className="fmt-table dp-scorecard">
                  <thead><tr><th></th><th>Prop · {d.p.aff_code}</th><th>Opp · {d.p.opp_code}</th></tr></thead>
                  <tbody>
                    {axes.map((a, i) => (
                      <tr key={a}>
                        <td className="axis">{axisLabel[a]}</td>
                        <td className={`score ${d.affScores[i] > d.oppScores[i] ? 'higher' : ''}`}>{d.affScores[i]}/5</td>
                        <td className={`score ${d.oppScores[i] > d.affScores[i] ? 'higher' : ''}`}>{d.oppScores[i]}/5</td>
                      </tr>
                    ))}
                    <tr className="total-row"><td>Total</td><td><b>{d.affTotal}/20</b></td><td><b>{d.oppTotal}/20</b></td></tr>
                  </tbody>
                </table>
                {(d.aff_note || d.opp_note) && (
                  <div className="fp-notes-block">
                    {d.aff_note && <div className="dp-note"><b>→ {d.p.aff_code}:</b> "{d.aff_note}"</div>}
                    {d.opp_note && <div className="dp-note"><b>→ {d.p.opp_code}:</b> "{d.opp_note}"</div>}
                  </div>
                )}
              </div>
            )
          })}
          {semiVoteInfo.map(x => (
            <div key={x.round} className={`dd-round ${x.won ? 'won' : ''}`}>
              <div className="dd-round-hd">
                <span className="dd-r">{x.round}</span>
                {isJudge ? (
                  <span>Panel vote: <b>{x.vote ? (x.vote === 'aff' ? 'PROP' : 'OPP') : '— did not vote'}</b></span>
                ) : x.none ? (
                  <span>Did not advance</span>
                ) : (
                  <span>{x.side === 'aff' ? 'Prop' : 'Opp'} vs {x.oppCode} · Panel {x.myVotes}–{x.other} · {x.won ? 'W' : 'L'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------------- MORE CHART TYPES ---------------- */
function Radar({ series, axesLabels, max = 15 }) {
  // series: [{label, values: [n,n,n,n], color}]
  const size = 260, cx = size / 2, cy = size / 2, r = size / 2 - 30
  const n = axesLabels.length
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pt = (v, i) => [cx + Math.cos(angle(i)) * (v / max) * r, cy + Math.sin(angle(i)) * (v / max) * r]
  const grid = [0.25, 0.5, 0.75, 1].map(pct =>
    Array.from({ length: n }, (_, i) => pt(pct * max, i)).map(([x, y]) => `${x},${y}`).join(' ')
  )
  return (
    <div className="s-radar-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="s-radar">
        {grid.map((pts, i) => <polygon key={i} points={pts} className="s-radar-grid" />)}
        {axesLabels.map((_, i) => {
          const [x, y] = pt(max, i)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="s-radar-axis" />
        })}
        {series.map((s, i) => {
          const pts = s.values.map((v, j) => pt(v, j).join(',')).join(' ')
          return (
            <g key={i}>
              <polygon points={pts} fill={s.color} fillOpacity={0.15} stroke={s.color} strokeWidth={2} />
              {s.values.map((v, j) => {
                const [x, y] = pt(v, j)
                return <circle key={j} cx={x} cy={y} r={3} fill={s.color} />
              })}
            </g>
          )
        })}
        {axesLabels.map((lbl, i) => {
          const [x, y] = pt(max * 1.15, i)
          return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="s-radar-label">{lbl}</text>
        })}
      </svg>
      <div className="s-radar-legend">
        {series.map((s, i) => (
          <div key={i}><span className="chip" style={{ background: s.color }} />{s.label} <small>{s.subLabel || ''}</small></div>
        ))}
      </div>
    </div>
  )
}

function LineChart({ series, xLabels, yMax = 20 }) {
  // series: [{label, values: [n,n,n], color}]
  const w = 720, h = 260, padL = 44, padB = 32, padT = 16, padR = 20
  const iw = w - padL - padR, ih = h - padT - padB
  const yTicks = [0, 5, 10, 15, 20]
  const xStep = xLabels.length > 1 ? iw / (xLabels.length - 1) : iw
  const yFor = v => padT + ih - (v / yMax) * ih
  return (
    <div className="s-line-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="s-line">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={yFor(t)} x2={w - padR} y2={yFor(t)} className="s-line-grid" />
            <text x={padL - 6} y={yFor(t)} textAnchor="end" dominantBaseline="middle" className="s-line-yl">{t}</text>
          </g>
        ))}
        {xLabels.map((lbl, i) => (
          <text key={i} x={padL + i * xStep} y={h - 8} textAnchor="middle" className="s-line-xl">{lbl}</text>
        ))}
        {series.map((s, i) => {
          const path = s.values.map((v, j) => (v == null ? null : `${j === 0 ? 'M' : 'L'}${padL + j * xStep},${yFor(v)}`)).filter(Boolean).join(' ')
          return (
            <g key={i}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2.5} />
              {s.values.map((v, j) => v == null ? null : (
                <circle key={j} cx={padL + j * xStep} cy={yFor(v)} r={4} fill={s.color} />
              ))}
            </g>
          )
        })}
      </svg>
      <div className="s-line-legend">
        {series.map((s, i) => (
          <div key={i}><span className="chip" style={{ background: s.color }} />{s.label}</div>
        ))}
      </div>
    </div>
  )
}

function Scatter({ points, xMax, yMax, xLabel, yLabel }) {
  // points: [{x, y, label, color}]
  const w = 640, h = 360, padL = 44, padB = 40, padT = 16, padR = 20
  const iw = w - padL - padR, ih = h - padT - padB
  const xFor = v => padL + (v / xMax) * iw
  const yFor = v => padT + ih - (v / yMax) * ih
  const xTicks = Array.from({ length: 5 }, (_, i) => Math.round((xMax / 4) * i))
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((yMax / 4) * i))
  return (
    <div className="s-scatter-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="s-scatter">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={yFor(t)} x2={w - padR} y2={yFor(t)} className="s-line-grid" />
            <text x={padL - 6} y={yFor(t)} textAnchor="end" dominantBaseline="middle" className="s-line-yl">{t}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={xFor(t)} y1={padT} x2={xFor(t)} y2={padT + ih} className="s-line-grid" />
            <text x={xFor(t)} y={h - 20} textAnchor="middle" className="s-line-xl">{t}</text>
          </g>
        ))}
        <text x={w / 2} y={h - 4} textAnchor="middle" className="s-line-title">{xLabel}</text>
        <text x={12} y={h / 2} textAnchor="middle" className="s-line-title" transform={`rotate(-90, 12, ${h / 2})`}>{yLabel}</text>
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={xFor(p.x)} cy={yFor(p.y)} r={5} fill={p.color} fillOpacity={0.55} stroke={p.color} />
            {p.label && <title>{p.label}: {p.x}, {p.y}</title>}
          </g>
        ))}
      </svg>
    </div>
  )
}

function StackedBar({ groups }) {
  // groups: [{label, segments: [{value, color, label}]}]
  const max = Math.max(1, ...groups.map(g => g.segments.reduce((s, x) => s + x.value, 0)))
  return (
    <div className="s-stacked">
      {groups.map((g, i) => {
        let acc = 0
        return (
          <div key={i} className="s-stacked-row">
            <div className="s-stacked-lbl">{g.label}</div>
            <div className="s-stacked-bar">
              {g.segments.map((sg, j) => {
                const w = (sg.value / max) * 100
                const el = (
                  <div key={j} className="s-stacked-seg" style={{ width: `${w}%`, background: sg.color }}
                       title={`${sg.label}: ${sg.value}`}>
                    {w > 8 && <span>{sg.value}</span>}
                  </div>
                )
                acc += sg.value
                return el
              })}
            </div>
            <div className="s-stacked-total">{g.segments.reduce((s, x) => s + x.value, 0)}</div>
          </div>
        )
      })}
    </div>
  )
}

function Sparkline({ values, max = 20, color = '#8cc63e' }) {
  const w = 80, h = 22
  if (!values || values.length === 0) return <svg width={w} height={h} />
  const step = values.length > 1 ? w / (values.length - 1) : w
  const yFor = v => v == null ? null : h - (v / max) * h
  const pts = values.map((v, i) => v == null ? null : `${i * step},${yFor(v)}`).filter(Boolean).join(' ')
  return (
    <svg width={w} height={h} className="s-spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
      {values.map((v, i) => v == null ? null : (
        <circle key={i} cx={i * step} cy={yFor(v)} r={2} fill={color} />
      ))}
    </svg>
  )
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
    const { data } = await supabase.from('allowed_users').select('*')
    // Natural sort: judges J1..J38, scholars A1..F10 numerically.
    const parseCode = (c) => {
      if (!c) return { letter: 'Z', num: 999 }
      const m = c.match(/^([A-Z]+)(\d+)/i)
      return m ? { letter: m[1].toUpperCase(), num: parseInt(m[2], 10) } : { letter: c, num: 0 }
    }
    const roleOrder = { admin: 0, judge: 1, scholar: 2 }
    const sorted = (data || []).slice().sort((a, b) => {
      const ra = roleOrder[a.role] ?? 9
      const rb = roleOrder[b.role] ?? 9
      if (ra !== rb) return ra - rb
      const pa = parseCode(a.code)
      const pb = parseCode(b.code)
      if (pa.letter !== pb.letter) return pa.letter.localeCompare(pb.letter)
      return pa.num - pb.num
    })
    setUsers(sorted)
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
