import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { generateIssuerKeys, didWeb } from '../lib/did'
import { issueSdJwt } from '../lib/sdjwt'
import type { Issuer } from '../lib/types'

// In the MVP the issuer's private key is generated in the browser and kept in
// memory for the session only. In production it would live in an HSM / KMS on
// the issuer's own server and never enter the browser.
export default function IssuerPanel({ user }: { user: User }) {
  const [issuer, setIssuer] = useState<Issuer | null>(null)
  const [privJwk, setPrivJwk] = useState<JsonWebKey | null>(null)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Recipient + claims
  const [recipientEmail, setRecipientEmail] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [degree, setDegree] = useState('')
  const [year, setYear] = useState('')
  const [gpa, setGpa] = useState('')
  const [out, setOut] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('issuers').select('*').eq('owner', user.id).maybeSingle()
      .then(({ data }) => setIssuer(data as Issuer | null))
  }, [user.id])

  async function register() {
    setBusy(true); setMsg(null)
    const { publicJwk, privateJwk } = await generateIssuerKeys()
    const did = didWeb(domain.trim())
    const { data, error } = await supabase
      .from('issuers')
      .insert({ owner: user.id, name: name.trim(), did, public_jwk: publicJwk, accredited: false })
      .select().single()
    if (error) setMsg(error.message)
    else {
      setIssuer(data as Issuer)
      setPrivJwk(privateJwk as JsonWebKey)
      setMsg('Registered. In this demo you must set accredited=true in Supabase to be trusted by verifiers.')
    }
    setBusy(false)
  }

  async function issue() {
    if (!issuer || !privJwk) {
      setMsg('Issuer private key is only held in memory. Re-register in this session to issue.')
      return
    }
    setBusy(true); setMsg(null); setOut(null)
    const subject: Record<string, unknown> = {
      name: subjectName,
      degree,
      university: issuer.name,
      year: Number(year),
    }
    if (gpa) subject.gpa = Number(gpa)

    const sdjwt = await issueSdJwt({
      issuerDid: issuer.did,
      issuerPrivateJwk: privJwk as any,
      vct: 'https://actik.kh/credentials/degree',
      subject,
      expiresInSec: 60 * 60 * 24 * 365 * 10, // 10 years
    })

    // Deliver to the recipient's "inbox": a pending_credentials row keyed by email.
    // The holder claims it from their device and encrypts it into their vault.
    const { error } = await supabase
      .from('pending_credentials')
      .insert({ recipient_email: recipientEmail.trim().toLowerCase(), sdjwt, issuer_did: issuer.did, label: degree })
    if (error) setMsg(error.message)
    else { setOut(sdjwt); setMsg('Issued and delivered to ' + recipientEmail) }
    setBusy(false)
  }

  return (
    <div>
      <div className="card">
        <h2>Issuer identity</h2>
        {issuer ? (
          <>
            <div className="claim"><span className="k">Name</span><span className="v">{issuer.name}</span></div>
            <div className="claim"><span className="k">DID</span><span className="v mono">{issuer.did}</span></div>
            <div className="claim">
              <span className="k">Trust status</span>
              <span className="v">
                {issuer.accredited
                  ? <span className="pill ok">Accredited</span>
                  : <span className="pill gold">Not yet accredited</span>}
              </span>
            </div>
            {!privJwk && <div className="notice info">Signing key not in memory. Re-register this session to issue (the private key is never stored).</div>}
          </>
        ) : (
          <>
            <p className="muted">Register your institution as an issuer. A did:web identity and an ES256 signing key are generated for you.</p>
            <label>Institution name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Royal University of Phnom Penh" />
            <label>Domain (for did:web)</label>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="rupp.edu.kh" />
            <button className="primary" onClick={register} disabled={busy || !name || !domain}>Register issuer</button>
          </>
        )}
      </div>

      {issuer && (
        <div className="card">
          <h2>Issue a degree credential</h2>
          <label>Recipient email (the holder)</label>
          <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} type="email" />
          <label>Student name</label>
          <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="សុខ ដារ៉ា" />
          <label>Degree</label>
          <input value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="BSc in Information Technology" />
          <div className="row">
            <div style={{ flex: 1 }}>
              <label>Year</label>
              <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2025" />
            </div>
            <div style={{ flex: 1 }}>
              <label>GPA (optional)</label>
              <input value={gpa} onChange={(e) => setGpa(e.target.value)} placeholder="3.8" />
            </div>
          </div>
          <button className="primary" onClick={issue} disabled={busy || !recipientEmail || !subjectName || !degree}>
            Sign &amp; deliver credential
          </button>
          {out && <div className="notice info"><strong>Issued SD-JWT</strong><div className="mono" style={{ marginTop: 6 }}>{out}</div></div>}
        </div>
      )}

      {msg && <div className="notice info">{msg}</div>}
    </div>
  )
}
