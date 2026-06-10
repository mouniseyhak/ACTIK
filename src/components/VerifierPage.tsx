import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { verify } from '../lib/sdjwt'
import type { Issuer, ShareRow } from '../lib/types'

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; valid: boolean; issuerName?: string; accredited: boolean; claims: Record<string, unknown>; message?: string }

// Public verifier. Anyone with the link can open it — no account needed.
// It runs the FULL trust check from the proposal:
//   1. signature valid + not expired (SD-JWT verify)
//   2. issuer DID exists in the registry (issuers table)
//   3. issuer is accredited (trust registry flag)
//   4. share link itself not expired
export default function VerifierPage({ shareId }: { shareId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    (async () => {
      const { data: share, error } = await supabase.from('shares').select('*').eq('id', shareId).maybeSingle()
      if (error || !share) return setState({ kind: 'error', message: 'Share not found.' })
      const s = share as ShareRow

      if (new Date(s.expires_at).getTime() < Date.now()) {
        return setState({ kind: 'done', valid: false, accredited: false, claims: {}, message: 'This share link has expired.' })
      }

      const { data: iss } = await supabase.from('issuers').select('*').eq('did', s.issuer_did).maybeSingle()
      const issuer = iss as Issuer | null
      if (!issuer) {
        return setState({ kind: 'done', valid: false, accredited: false, claims: {}, message: 'Issuer is not in the trust registry.' })
      }

      const result = await verify(s.presentation, issuer.public_jwk)
      setState({
        kind: 'done',
        valid: result.valid,
        issuerName: issuer.name,
        accredited: issuer.accredited,
        claims: result.claims,
        message: result.error,
      })
    })()
  }, [shareId])

  if (state.kind === 'loading') return <div className="card">Verifying…</div>
  if (state.kind === 'error') return <div className="card"><div className="notice err">{state.message}</div></div>

  const trusted = state.valid && state.accredited
  return (
    <div className="card">
      <div className="result">
        <div className="big" style={{ color: trusted ? 'var(--ok)' : 'var(--danger)' }}>
          {trusted ? '✓ Verified credential' : '✕ Not verified'}
        </div>
        {state.issuerName && (
          <p className="muted">
            Issued by {state.issuerName}{' '}
            {state.accredited ? <span className="pill ok">Accredited</span> : <span className="pill bad">Not accredited</span>}
          </p>
        )}
        {state.message && <div className="notice err">{state.message}</div>}
      </div>

      {state.valid && Object.keys(state.claims).length > 0 && (
        <div>
          <h3>Disclosed information</h3>
          {Object.entries(state.claims).map(([k, v]) => (
            <div key={k} className="claim"><span className="k">{k}</span><span className="v">{String(v)}</span></div>
          ))}
          <p className="muted" style={{ marginTop: 12 }}>
            Only the fields above were shared. Any other fields on the credential remain hidden.
          </p>
        </div>
      )}
    </div>
  )
}
