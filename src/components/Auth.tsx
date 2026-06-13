import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Auth() {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true)
      setErrorMsg(null)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during Google sign-in'
      setErrorMsg(msg)
      setLoading(false)
    }
  }

  const spinnerStyle = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '1rem', fontFamily: 'inherit' }}>
      <style>{spinnerStyle}</style>
      <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center', padding: '2.5rem 1.8rem' }}>
        
        {/* Brand Logo & Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: 'var(--gold)' }} />
          <h1 style={{ fontSize: '2.1rem', margin: 0, color: 'var(--forest)', fontFamily: "'Fraunces', serif" }}>Actik</h1>
        </div>

        <p className="muted" style={{ marginBottom: '2rem', fontSize: '0.92rem', lineHeight: '1.5' }}>
          Secure digital certificates for Cambodia. Backed by W3C verifiable credentials and zero-knowledge storage.
        </p>

        {/* Google OAuth Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            fontSize: '0.95rem',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow)',
            fontWeight: 500,
            fontFamily: 'inherit',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.backgroundColor = 'var(--paper)'
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.backgroundColor = 'var(--surface)'
          }}
        >
          {loading ? (
            <svg 
              style={{ 
                animation: 'spin 1s linear infinite', 
                width: 20, 
                height: 20, 
                color: 'var(--muted)' 
              }} 
              fill="none" 
              viewBox="0 0 24 24"
            >
              <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg style={{ width: 20, height: 20, display: 'block' }} viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69c-.29 1.5-.1.88-1.5 2.11v2.53h2.4c1.4-1.3 2.2-3.2 2.2-5.49z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.88-3.02c-1.08.72-2.45 1.16-4.08 1.16-3.14 0-5.8-2.11-6.75-4.96H1.31v3.11C3.29 22.3 7.39 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.25 14.27c-.25-.72-.39-1.5-.39-2.27s.14-1.55.39-2.27V6.62H1.31C.47 8.24 0 10.06 0 12s.47 3.76 1.31 5.38l3.94-3.11z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.39 0 3.29 1.7 1.31 4.75l3.94 3.11c.95-2.85 3.61-4.96 6.75-4.96z"
              />
            </svg>
          )}
          <span>{loading ? 'Connecting...' : 'Continue with Google'}</span>
        </button>

        {errorMsg && (
          <div className="notice err" style={{ marginTop: '1.25rem', textAlign: 'left' }}>
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  )
}
