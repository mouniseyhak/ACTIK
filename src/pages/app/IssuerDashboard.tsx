import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { generateIssuerKeys, didWeb } from '../../lib/did'

import { useLanguage } from '../../lib/i18n'

// Shared keyframe spinner animation
const spinStyles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`

interface IssuerInfo {
  id: string
  name: string
  domain: string
  type: string
  did: string
  accredited: boolean
  rawIssuerData: any
}

export default function IssuerDashboard() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  
  // Loading & state management
  const [loading, setLoading] = useState(true)
  const [issuerInfo, setIssuerInfo] = useState<IssuerInfo | null>(null)
  const [privateKey, setPrivateKey] = useState<any | null>(null)
  
  // Registration Form Fields
  const [regName, setRegName] = useState('')
  const [regDomain, setRegDomain] = useState('')
  const [regType, setRegType] = useState('')
  const [regErrors, setRegErrors] = useState<Record<string, string>>({})
  const [regSubmitError, setRegSubmitError] = useState<string | null>(null)
  const [isRegistering, setIsRegistering] = useState(false)
  const [registerSuccessMsg, setRegisterSuccessMsg] = useState<string | null>(null)

  // Key Re-generation state
  const [isUpdatingKeys, setIsUpdatingKeys] = useState(false)
  const [updateKeysError, setUpdateKeysError] = useState<string | null>(null)


  // Check registration and keys on mount/update
  useEffect(() => {
    let active = true

    async function loadDashboardData() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session || !session.user) {
          navigate('/auth/login', { replace: true })
          return
        }

        if (active) {
          setCurrentUser(session.user)
        }

        // Query issuers table (trying owner first as per schema.sql)
        let { data: issuerData, error: issuerError } = await supabase
          .from('issuers')
          .select('*')
          .eq('owner', session.user.id)
          .maybeSingle()

        if (issuerError && (issuerError.message.includes('owner') || issuerError.code === 'PGRST204')) {
          const fallback = await supabase
            .from('issuers')
            .select('*')
            .eq('owner', session.user.id)
            .maybeSingle()
          issuerData = fallback.data
          issuerError = fallback.error
        }

        if (!active) return

        if (issuerData) {
          // Extract domain
          let domainVal = issuerData.domain || ''
          if (!domainVal && issuerData.did && issuerData.did.startsWith('did:web:')) {
            domainVal = decodeURIComponent(issuerData.did.substring(8))
          }

          setIssuerInfo({
            id: issuerData.id,
            name: issuerData.name,
            domain: domainVal,
            type: issuerData.type || 'University',
            did: issuerData.did,
            accredited: !!issuerData.accredited,
            rawIssuerData: issuerData
          })

          // Retrieve private key from sessionStorage
          const keyJson = sessionStorage.getItem('issuer_private_key')
          if (keyJson) {
            setPrivateKey(JSON.parse(keyJson))
          } else {
            setPrivateKey(null)
          }
        } else {
          setIssuerInfo(null)
        }

        setLoading(false)
      } catch (err) {
        console.error('Failed to load dashboard data:', err)
        if (active) {
          setLoading(false)
        }
      }
    }

    loadDashboardData()
    return () => { active = false }
  }, [navigate])


  // Registration Domain validation helper
  const handleDomainBlur = () => {
    let clean = regDomain.trim()
    clean = clean.replace(/^(https?:\/\/)?(www\.)?/, '')
    clean = clean.split('/')[0]
    setRegDomain(clean)
  }

  // Handle Institution Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return

    // Validate
    const nextErrors: Record<string, string> = {}
    if (regName.trim().length < 3) {
      nextErrors.name = 'Institution name must be at least 3 characters.'
    }
    if (!regDomain.trim()) {
      nextErrors.domain = 'Domain is required.'
    } else if (regDomain.includes(' ')) {
      nextErrors.domain = 'Domain must not contain spaces.'
    } else if (!regDomain.includes('.')) {
      nextErrors.domain = 'Domain must contain at least one dot.'
    }
    if (!regType) {
      nextErrors.type = 'Please select an institution type.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setRegErrors(nextErrors)
      return
    }

    setRegErrors({})
    setRegSubmitError(null)
    setIsRegistering(true)

    try {
      // 1. Generate keys
      const { publicJwk, privateJwk } = await generateIssuerKeys()
      const did = didWeb(regDomain.trim())

      // Try schema.sql columns first (owner, public_jwk) to avoid 400 console errors
      let res = await supabase.from('issuers').insert({
        owner: currentUser.id,
        name: regName.trim(),
        did: did,
        public_jwk: publicJwk,
        accredited: false
      })

      if (res.error && (res.error.message.includes('owner') || res.error.message.includes('public_jwk') || res.error.code === '42703')) {
        res = await supabase.from('issuers').insert({
          user_id: currentUser.id,
          name: regName.trim(),
          domain: regDomain.trim(),
          type: regType,
          did: did,
          public_key: JSON.stringify(publicJwk),
          accredited: false
        })
      }

      if (res.error) throw res.error

      // 3. Save private key in sessionStorage
      sessionStorage.setItem('issuer_private_key', JSON.stringify(privateJwk))
      sessionStorage.setItem('issuer_did', did)

      // 4. Update states
      setPrivateKey(privateJwk)
      setIssuerInfo({
        id: currentUser.id,
        name: regName.trim(),
        domain: regDomain.trim(),
        type: regType,
        did: did,
        accredited: false,
        rawIssuerData: null
      })
      setRegisterSuccessMsg('Institution registered successfully!')
    } catch (err: any) {
      setRegSubmitError(err.message || 'Failed to register institution. Please try again.')
    } finally {
      setIsRegistering(false)
    }
  }

  // Handle re-generating session keys (if missing from sessionStorage)
  const handleRegenerateKeys = async () => {
    if (!currentUser || !issuerInfo) return
    setIsUpdatingKeys(true)
    setUpdateKeysError(null)

    try {
      // 1. Generate keys
      const { publicJwk, privateJwk } = await generateIssuerKeys()

      // 2. Update Supabase (trying owner first as per schema.sql, fallback to user_id)
      let res = await supabase
        .from('issuers')
        .update({
          public_jwk: publicJwk
        })
        .eq('owner', currentUser.id)

      if (res.error && (res.error.message.includes('owner') || res.error.message.includes('public_jwk') || res.error.code === '42703')) {
        res = await supabase
          .from('issuers')
          .update({
            public_key: JSON.stringify(publicJwk)
          })
          .eq('user_id', currentUser.id)
      }

      if (res.error) throw res.error

      // 3. Save to sessionStorage
      sessionStorage.setItem('issuer_private_key', JSON.stringify(privateJwk))
      sessionStorage.setItem('issuer_did', issuerInfo.did)

      // 4. Update state
      setPrivateKey(privateJwk)
    } catch (err: any) {
      setUpdateKeysError(err.message || 'Failed to update keys. Please try again.')
    } finally {
      setIsUpdatingKeys(false)
    }
  }




  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] w-full">
        <style>{spinStyles}</style>
        <div style={{
          width: 44,
          height: 44,
          border: '4px solid #e0e7ff',
          borderTop: '4px solid #4f46e5',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p className="text-gray-500 mt-4 font-semibold text-sm">{t('dashboard.loading_dashboard')}</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 md:py-10">
      <style>{spinStyles}</style>

      {/* SECTION 1 — REGISTER INSTITUTION (if not registered yet) */}
      {!issuerInfo ? (
        <div className="w-full max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-stone-200 p-6 md:p-10">
          <div className="text-center mb-6">
            <span className="text-4xl">🏛️</span>
            <h1 className="text-2xl font-bold text-stone-900 mt-3">{t('dashboard.register_institution')}</h1>
            <p className="text-sm text-stone-500 mt-1">
              {t('dashboard.register_desc')}
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="text-xs md:text-sm font-bold text-stone-700 block mb-1">
                {t('dashboard.institution_name')}
              </label>
              <input
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Royal University of Phnom Penh"
                className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
              />
              {regErrors.name && (
                <p className="text-red-600 text-xs mt-1 font-semibold">{regErrors.name}</p>
              )}
            </div>

            <div>
              <label className="text-xs md:text-sm font-bold text-stone-700 block mb-1">
                {t('dashboard.domain_name')}
              </label>
              <input
                type="text"
                value={regDomain}
                onChange={(e) => setRegDomain(e.target.value)}
                onBlur={handleDomainBlur}
                placeholder="rupp.edu.kh"
                className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
              />
              <p className="text-[11px] text-stone-500 mt-1 leading-normal">
                {t('dashboard.domain_desc')}
              </p>
              {regErrors.domain && (
                <p className="text-red-600 text-xs mt-1 font-semibold">{regErrors.domain}</p>
              )}
            </div>

            <div>
              <label className="text-xs md:text-sm font-bold text-stone-700 block mb-1">
                {t('dashboard.institution_type')}
              </label>
              <select
                value={regType}
                onChange={(e) => setRegType(e.target.value)}
                className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
              >
                <option value="">{t('dashboard.select_type')}</option>
                <option value="University">{t('dashboard.university')}</option>
                <option value="Ministry">{t('dashboard.ministry')}</option>
                <option value="Training Centre">{t('dashboard.training_centre')}</option>
                <option value="Other">{t('dashboard.other')}</option>
              </select>
              {regErrors.type && (
                <p className="text-red-600 text-xs mt-1 font-semibold">{regErrors.type}</p>
              )}
            </div>

            {regSubmitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg p-3">
                {regSubmitError}
              </div>
            )}

            <button
              type="submit"
              disabled={isRegistering}
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer"
            >
              {isRegistering && (
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              <span>{t('dashboard.register_btn')}</span>
            </button>
          </form>
        </div>
      ) : (
        /* SECTION 2 — REGISTRATION SUCCESS AND ISSUANCE CONTROL */
        <div className="space-y-6">
          
          {registerSuccessMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 flex justify-between items-center text-sm font-semibold mb-2 shadow-sm">
              <div className="flex items-center gap-2">
                <span>✅</span>
                <span>{registerSuccessMsg}</span>
              </div>
              <button 
                onClick={() => setRegisterSuccessMsg(null)}
                className="text-emerald-500 hover:text-emerald-700 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Heading */}
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-stone-200 gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">{t('dashboard.issuer_dashboard')}</h1>
              <p className="text-sm text-stone-500 mt-0.5">
                {t('dashboard.manage_desc')}
              </p>
            </div>
          </div>


          {/* If NOT Accredited: Warning Yellow Card */}
          {!issuerInfo.accredited ? (
            <div className="bg-amber-50 border-l-4 border-amber-500 rounded-xl p-6 md:p-8 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="text-3xl mt-0.5">⏳</div>
                <div>
                  <h2 className="text-lg font-bold text-amber-800">{t('dashboard.awaiting_approval')}</h2>
                  <p className="text-sm text-stone-600 mt-2 leading-relaxed">
                    {t('dashboard.awaiting_desc')}
                  </p>
                  <p className="text-xs text-stone-500 mt-3 font-medium italic">
                    {t('dashboard.awaiting_note')}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* If Accredited: Check Session Cryptographic Key */
            !privateKey ? (
              <div className="bg-amber-50 border-l-4 border-amber-500 rounded-xl p-6 md:p-8 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="text-3xl mt-0.5">🔑</div>
                  <div className="w-full">
                    <h2 className="text-lg font-bold text-amber-800">{t('dashboard.key_expired')}</h2>
                    <p className="text-sm text-stone-600 mt-2 leading-relaxed font-normal">
                      {t('dashboard.key_expired_desc1')}
                    </p>
                    <p className="text-sm text-stone-600 mt-2 leading-relaxed font-semibold">
                      {t('dashboard.key_expired_desc2')}
                    </p>

                    {updateKeysError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 mt-3 font-semibold">
                        {updateKeysError}
                      </div>
                    )}

                    <button
                      onClick={handleRegenerateKeys}
                      disabled={isUpdatingKeys}
                      className="mt-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 px-6 rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isUpdatingKeys && (
                        <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      )}
                      <span>{t('dashboard.regenerate_keys')}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* If accredited & key is active: Credential Issuance Panel (Navigates to new flow) */
              <div className="bg-white rounded-2xl border border-stone-200 p-8 shadow-sm flex flex-col items-center text-center py-16">
                <div className="text-5xl mb-4">📋</div>
                <h2 className="text-xl font-bold text-stone-900 mb-2">{t('dashboard.issue_credential')}</h2>
                <p className="text-sm text-stone-500 mb-6 max-w-md mx-auto">
                  {t('dashboard.issue_credential_desc')}
                </p>
                <button
                  onClick={() => navigate('/app/issue')}
                  className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 px-8 rounded-lg text-sm transition-all focus:outline-none cursor-pointer inline-flex items-center gap-2"
                >
                  <span>{t('dashboard.start_issuance')}</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
