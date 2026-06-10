import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import Auth from './components/Auth'
import IssuerPanel from './components/IssuerPanel'
import HolderPanel from './components/HolderPanel'
import VerifierPage from './components/VerifierPage'

// zk-vault provider — wraps the holder experience. Copy the library into
// src/vault/ first (see README).
import { VaultProvider } from './vault/zk-vault'
import { supabaseVaultAdapter } from './vault/vaultAdapter'

type Tab = 'holder' | 'issuer' | 'verify'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [tab, setTab] = useState<Tab>('holder')

  // A ?share=<id> link opens the public verifier with no login required.
  const shareId = new URLSearchParams(location.search).get('share')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (shareId) {
    return (
      <div className="app">
        <Header email={null} />
        <h1>Verify a credential</h1>
        <p className="muted" style={{ marginBottom: 16 }}>Shared with you via Actik.</p>
        <VerifierPage shareId={shareId} />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app">
        <Header email={null} />
        <Auth />
      </div>
    )
  }

  const user = session.user
  return (
    <VaultProvider storageAdapter={supabaseVaultAdapter}>
      <div className="app">
        <Header email={user.email ?? null} />
        <div className="tabs">
          <button className={tab === 'holder' ? 'active' : ''} onClick={() => setTab('holder')}>My wallet</button>
          <button className={tab === 'issuer' ? 'active' : ''} onClick={() => setTab('issuer')}>Issue</button>
          <button className={tab === 'verify' ? 'active' : ''} onClick={() => setTab('verify')}>Verify</button>
        </div>
        {tab === 'holder' && <HolderPanel user={user} />}
        {tab === 'issuer' && <IssuerPanel user={user} />}
        {tab === 'verify' && (
          <div className="card">
            <p className="muted">Open a share link (…/?share=ID) to verify a credential. Verification needs no account.</p>
          </div>
        )}
      </div>
    </VaultProvider>
  )
}

function Header({ email }: { email: string | null }) {
  return (
    <header className="top">
      <div className="brand">
        <span className="dot" />
        <h1 style={{ fontSize: '1.4rem' }}>Actik</h1>
        <small>digital certificates</small>
      </div>
      {email && (
        <div className="row">
          <span className="muted">{email}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      )}
    </header>
  )
}
