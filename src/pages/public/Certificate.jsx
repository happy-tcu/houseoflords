import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PublicShell from '../../components/PublicShell'
import { supabase } from '../../lib/supabase'

// Generic certificate page. Use ?code=A1&name=... to preview/print.
export default function Certificate() {
  const [params] = useSearchParams()
  const code = params.get('code') || ''
  const nameParam = params.get('name') || ''
  const [name, setName] = useState(nameParam)

  useEffect(() => {
    if (!nameParam && code) {
      (async () => {
        const { data } = await supabase.from('allowed_users').select('name').eq('code', code).maybeSingle()
        if (data?.name) setName(data.name)
      })()
    }
  }, [code, nameParam])

  return (
    <PublicShell>
      <section className="block">
        <div className="container">
          <div className="cert-controls">
            <label>Code <input value={code} readOnly /></label>
            <label>Name <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /></label>
            <button className="btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
          </div>

          <div className="cert-page">
            <div className="cert-inner">
              <div className="cert-kicker">Isomo · House of Lords</div>
              <div className="cert-title">Certificate of Participation</div>
              <div className="cert-body">
                This is to certify that
                <div className="cert-name">{name || '—'}</div>
                <span className="cert-code">{code || '—'}</span>
                <div>participated in the <b>House of Lords 2026</b> Scholars' Debate on <b>18 July 2026</b>,
                interrogating Rwanda's Vision 2050 across five rounds and twenty‑five motions.</div>
              </div>
              <div className="cert-foot">
                <div className="cert-sig"><span>Isomo</span></div>
                <div className="cert-tag">What can we do now, with what we have?</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
