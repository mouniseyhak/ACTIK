import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setMsg(null)
    const fn = mode === 'in' ? supabase.auth.signInWithPassword : supabase.auth.signUp
    const { error } = await fn({ email, password })
    if (error) setMsg(error.message)
    else if (mode === 'up') setMsg('Check your email to confirm, then sign in.')
    setBusy(false)
  }

  return (
    <div className="card" style={{ maxWidth: 380, margin: '3rem auto' }}>
      <h2>{mode === 'in' ? 'Sign in' : 'Create account'}</h2>
      <label>Email</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
      <label>Password</label>
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
      <button className="primary" onClick={submit} disabled={busy || !email || !password}>
        {busy ? '…' : mode === 'in' ? 'Sign in' : 'Sign up'}
      </button>
      <p className="muted" style={{ marginTop: '0.8rem' }}>
        {mode === 'in' ? "No account?" : 'Have an account?'}{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'in' ? 'up' : 'in') }}>
          {mode === 'in' ? 'Create one' : 'Sign in'}
        </a>
      </p>
      {msg && <div className="notice info">{msg}</div>}
    </div>
  )
}
