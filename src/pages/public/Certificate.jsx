import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PublicShell from '../../components/PublicShell'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/realtime'

// Placement-aware certificate with approval gate.
export default function Certificate() {
  const [params] = useSearchParams()
  const code = params.get('code') || ''
  const nameParam = params.get('name') || ''
  const [name, setName] = useState(nameParam)
  const [rows, setRows] = useState({ pairings: [], ballots: [] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!nameParam && code) {
      (async () => {
        const { data } = await supabase.from('allowed_users').select('name').eq('code', code).maybeSingle()
        if (data?.name) setName(data.name)
      })()
    }
  }, [code, nameParam])

  useEffect(() => {
    (async () => {
      const [{ data: pairings }, { data: ballots }] = await Promise.all([
        supabase.from('pairings').select('*'),
        supabase.from('ballots').select('*'),
      ])
      setRows({ pairings: pairings || [], ballots: ballots || [] })
    })()
  }, [])

  const placement = useMemo(() => derivePlacement(code, rows), [code, rows])
  const meta = PLACEMENTS[placement.key] || PLACEMENTS.participant

  const { rows: requests } = useRealtime(
    'certificate_requests',
    code ? { eq: { code } } : null,
    [code]
  )
  const myRequest = (requests || [])
    .filter(r => r.name?.toLowerCase() === name.toLowerCase())
    .sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at))[0]

  const isApproved = !!myRequest?.approved_at

  async function submitForSigning(e) {
    e?.preventDefault(); setBusy(true); setErr(null)
    if (!code || !name.trim()) { setErr('Enter a code and name.'); setBusy(false); return }
    const { error } = await supabase.from('certificate_requests').insert({
      code, name: name.trim(), placement: placement.key,
    })
    if (error) setErr(error.message)
    setBusy(false)
  }

  const canPrint = isApproved
  const statusLabel = !code
    ? 'Enter your scholar code to request a certificate'
    : !myRequest
      ? 'Not yet submitted'
      : isApproved
        ? `Approved · ${new Date(myRequest.approved_at).toLocaleString()}`
        : `Awaiting Faculty signature · submitted ${new Date(myRequest.requested_at).toLocaleTimeString()}`

  return (
    <PublicShell>
      <section className="block">
        <div className="container">
          <div className="cert-controls">
            <label>Code
              <input value={code} readOnly placeholder="A1, J4, …" />
            </label>
            <label>Full Name
              <input value={name} onChange={e => setName(e.target.value)}
                     placeholder="Your name as it should appear" />
            </label>
            <label>Award (auto)
              <input value={meta.title} readOnly />
            </label>
            {!isApproved ? (
              <button className="btn-primary" onClick={submitForSigning}
                      disabled={busy || !code || !name.trim() || !!myRequest}>
                {busy ? 'Submitting…'
                  : myRequest ? 'Awaiting signature'
                  : 'Submit for Faculty signing'}
              </button>
            ) : (
              <button className="btn-primary" onClick={() => window.print()}>
                Download / Print PDF
              </button>
            )}
          </div>

          {err && <div className="landing-err">{err}</div>}

          <div className={`cert-status ${isApproved ? 'ok' : myRequest ? 'wait' : ''}`}>
            <span className="cs-icon">{isApproved ? '✓' : myRequest ? '⏳' : '•'}</span>
            <span className="cs-text">{statusLabel}</span>
            {isApproved && (
              <span className="cs-tag">Signed by {myRequest.signature_name || 'Isomo Faculty'}</span>
            )}
          </div>

          <div className={`cert-v2 print-area ${canPrint ? '' : 'is-preview'}`}>
            <div className="cv-frame">
              <span className="cv-corner tl" /><span className="cv-corner tr" />
              <span className="cv-corner bl" /><span className="cv-corner br" />

              <div className="cv-inner">
                <img className="cv-logo" src="/assets/isomo.png" alt="Isomo" />

                <div className="cv-event">
                  House of Lords · {meta.key === 'judge' ? 'Judging Panel' : "Scholars' Debate"}
                </div>
                <div className="cv-title">{meta.title}</div>
                <div className="cv-subtitle">{meta.subtitle}</div>

                <div className="cv-presented">This certificate is presented to</div>
                <div className="cv-name">{name || 'Full Name'}</div>
                {code && (
                  <span className="cv-code">
                    {meta.key === 'judge' ? 'Judge Code' : 'Scholar Code'} · {code}
                  </span>
                )}

                <p className="cv-citation">{meta.citation}</p>

                <div className="cv-footer">
                  <div className="cv-sig">
                    <div className={`cv-sig-signed ${isApproved ? 'on' : ''}`}>
                      {isApproved ? (myRequest.signature_name || 'Isomo Faculty') : ''}
                    </div>
                    <div className="cv-sig-line" />
                    <div className="cv-sig-label">Isomo Faculty</div>
                  </div>
                  <div className="cv-seal">
                    <div className="cv-seal-inner">
                      <div className="cv-seal-year">2026</div>
                      <div className="cv-seal-tag">Vision 2050</div>
                    </div>
                  </div>
                  <div className="cv-sig">
                    <div className={`cv-sig-signed ${isApproved ? 'on' : ''}`}>
                      {isApproved ? 'Happy Herman' : ''}
                    </div>
                    <div className="cv-sig-line" />
                    <div className="cv-sig-label">Tournament Director</div>
                  </div>
                </div>

                <div className="cv-issued">
                  {isApproved ? `Issued ${new Date(myRequest.approved_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}`
                    : 'Draft · pending Faculty signature'}
                  {' · Rwamagana · Ntunga, Rwanda'}
                </div>
              </div>

              {!canPrint && (
                <div className="cert-watermark">
                  <span>UNSIGNED PREVIEW</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

const PLACEMENTS = {
  champion: {
    key: 'champion',
    title: 'Champion',
    subtitle: 'First Place · House of Lords 2026',
    citation:
      "For debating with rare force and clarity in service of a bolder Rwanda — earning the top honour of the House of Lords 2026 tournament on the question of Vision 2050.",
  },
  finalist: {
    key: 'finalist',
    title: 'Runner-up',
    subtitle: 'Second Place · House of Lords 2026',
    citation:
      "For advancing to the House of Lords 2026 final and defending, with distinction, a compelling vision for Rwanda's next twenty-five years.",
  },
  quarterfinalist: {
    key: 'quarterfinalist',
    title: 'Quarterfinalist',
    subtitle: 'Top Four · House of Lords 2026',
    citation:
      "For advancing to the House of Lords 2026 quarterfinal — placing among the top four scholar debaters in the interrogation of Vision 2050.",
  },
  participant: {
    key: 'participant',
    title: 'Certificate of Participation',
    subtitle: 'House of Lords 2026',
    citation:
      "For carrying the House of Lords 2026 through five rounds of impromptu debate, interrogating Rwanda's Vision 2050 with courage, care, and conviction.",
  },
  judge: {
    key: 'judge',
    title: 'Distinguished Judge',
    subtitle: 'House of Lords 2026',
    citation:
      "For adjudicating the House of Lords 2026 with fairness and rigour, holding scholars to the highest standard of civic reasoning.",
  },
  organizer: {
    key: 'organizer',
    title: 'Recognition of Service',
    subtitle: 'House of Lords 2026',
    citation:
      "For the vision, planning, and execution that brought the House of Lords 2026 to life — a stage where a new generation of Rwandans practiced governing.",
  },
}

function derivePlacement(code, { pairings, ballots }) {
  if (!code) return PLACEMENTS.participant
  if (/^J\d+$/.test(code)) return PLACEMENTS.judge

  const r5 = pairings.find(p => p.round_id === 'R5' && (p.aff_code === code || p.opp_code === code))
  if (r5) {
    const b = ballots.find(x => x.round_id === 'R5' && x.room === r5.room)
    if (b) {
      const winnerCode = b.winner === 'aff' ? r5.aff_code : r5.opp_code
      return winnerCode === code ? PLACEMENTS.champion : PLACEMENTS.finalist
    }
    return PLACEMENTS.finalist
  }
  const r4 = pairings.find(p => p.round_id === 'R4' && (p.aff_code === code || p.opp_code === code))
  if (r4) return PLACEMENTS.quarterfinalist
  return PLACEMENTS.participant
}
