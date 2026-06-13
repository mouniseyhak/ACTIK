import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface AuthGuardProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'issuer' | 'student'
}

export default function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const [loading, setLoading] = useState(true)
  const [redirectPath, setRedirectPath] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function checkAuth() {
      try {
        // Step 1: Check session
        const { data: { session } } = await supabase.auth.getSession()

        if (!active) return

        if (!session || !session.user) {
          setRedirectPath('/auth/login')
          setLoading(false)
          return
        }

        // Step 2: Check role if requiredRole is provided
        if (requiredRole) {
          const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single()

          if (!active) return

          if (error || !data || data.role !== requiredRole) {
            setRedirectPath('/app/dashboard')
            setLoading(false)
            return
          }
        }

        // Both checks passed
        if (active) {
          setRedirectPath(null)
          setLoading(false)
        }
      } catch (err) {
        if (active) {
          setRedirectPath('/auth/login')
          setLoading(false)
        }
      }
    }

    checkAuth()

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!active) return

      if (!currentSession) {
        setRedirectPath('/auth/login')
        setLoading(false)
      } else {
        // Re-run checks if auth state changed (e.g. login/token refresh)
        checkAuth()
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [requiredRole])

  // Step 3: Render logic based on state
  if (loading) {
    const spinnerStyle = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#fff', fontFamily: 'inherit' }}>
        <style>{spinnerStyle}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: 40,
            height: 40,
            border: '4px solid var(--forest-soft)',
            borderTop: '4px solid var(--forest)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', margin: 0 }}>Checking access...</p>
        </div>
      </div>
    )
  }

  if (redirectPath) {
    return <Navigate to={redirectPath} replace />
  }

  return <>{children}</>
}
