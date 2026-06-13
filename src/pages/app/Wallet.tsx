import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { readDisclosures } from '../../lib/sdjwt'

// Import from the actual zk-vault hook available in this project
import { useZkVault } from '../../vault/zk-vault'

// Date formatting helper
const formatDate = (dateStr: string) => {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const day = d.getDate()
    const month = d.toLocaleDateString('en-US', { month: 'long' })
    const year = d.getFullYear()
    return `${day} ${month} ${year}`
  } catch {
    return dateStr
  }
}


// Shared keyframe spinner animation
const spinStyles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`

interface Credential {
  id: string
  issuer_id: string
  holder_id: string | null
  holder_email: string
  issuer_did: string
  institution_name: string
  degree_title: string
  sd_jwt: string
  claimed: boolean
  claimed_at: string | null
  created_at: string
  graduation_date?: string | null

  // Decryption fallbacks for original schema.sql
  cipher?: string
  iv?: string
}

export default function Wallet() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  
  // ZK-Vault state via the custom useZkVault hook
  const { 
    isUnlocked, 
    checkVaultStatus, 
    unlockWithPin, 
    unlockWithPasskey, 
    decryptPayload 
  } = useZkVault()

  // Vault setup state
  const [vaultExists, setVaultExists] = useState<boolean | null>(null)
  const [vaultStatusLoading, setVaultStatusLoading] = useState(true)
  const [unlockMethod, setUnlockMethod] = useState<'pin' | 'passkey' | 'biometric' | 'both' | null>(null)

  // Credentials State
  const [claimedCredentials, setClaimedCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<boolean>(false)

  // Modals & Action States
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [showSetupNeededModal, setShowSetupNeededModal] = useState(false)

  // Inline details panel expanded state
  const [expandedCredId, setExpandedCredId] = useState<string | null>(null)
  const [decryptedFields, setDecryptedFields] = useState<Record<string, any>>({})
  const [expandedRawJwts, setExpandedRawJwts] = useState<Record<string, boolean>>({})
  const [decryptingCredId, setDecryptingCredId] = useState<string | null>(null)

  // Helper: Display toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Check vault configuration on mount & session changes
  const checkVault = useCallback(async (userId: string) => {
    try {
      setVaultStatusLoading(true)
      const status = await checkVaultStatus(userId)
      if (status.status === 'ok') {
        setVaultExists(status.exists)
      } else {
        setVaultExists(false)
      }

      // Fetch unlock method from vaults table
      const { data: vaultData } = await supabase
        .from('vaults')
        .select('unlock_method')
        .eq('user_id', userId)
        .maybeSingle()

      if (vaultData && vaultData.unlock_method) {
        setUnlockMethod(vaultData.unlock_method as 'pin' | 'passkey' | 'both')
      } else {
        // Fallback: Check profiles table if vaults table is missing or empty
        const { data: profileData } = await supabase
          .from('profiles')
          .select('vault_envelope_pin, vault_envelope_passkey')
          .eq('id', userId)
          .maybeSingle()
        
        if (profileData) {
          const hasPin = !!profileData.vault_envelope_pin
          const hasPasskey = !!profileData.vault_envelope_passkey
          if (hasPin && hasPasskey) {
            setUnlockMethod('both')
          } else if (hasPin) {
            setUnlockMethod('pin')
          } else if (hasPasskey) {
            setUnlockMethod('passkey')
          } else {
            setUnlockMethod(null)
          }
        } else {
          setUnlockMethod(null)
        }
      }
    } catch {
      setVaultExists(false)
      setUnlockMethod(null)
    } finally {
      setVaultStatusLoading(false)
    }
  }, [checkVaultStatus, setUnlockMethod])

  // Fetch claimed credentials
  const loadCredentials = useCallback(async (user: any) => {
    try {
      setLoading(true)
      setLoadError(false)

      // Query credentials using the actual schema.sql column (owner)
      const claimedRes = await supabase
        .from('credentials')
        .select('*')
        .eq('owner', user.id)
        .order('created_at', { ascending: false })

      if (claimedRes.error) throw claimedRes.error

      const claimedList: Credential[] = (claimedRes.data || []).map((c: any) => ({
        id: c.id,
        issuer_id: c.issuer_id || '',
        holder_id: c.owner,
        holder_email: c.holder_email || user.email,
        issuer_did: c.issuer_did || '',
        institution_name: c.institution_name || '',
        degree_title: c.degree_title || c.label || 'Degree Certificate',
        sd_jwt: c.sd_jwt || '',
        claimed: c.claimed ?? true,
        claimed_at: c.claimed_at || c.created_at,
        created_at: c.created_at,
        graduation_date: c.graduation_date || null,
        cipher: c.cipher,
        iv: c.iv
      }))

      setClaimedCredentials(claimedList)
      setLoading(false)
    } catch (err) {
      setLoadError(true)
      setLoading(false)
    }
  }, [])

  // Mount logic
  useEffect(() => {
    let active = true
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        navigate('/auth/login', { replace: true })
        return
      }

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (active) {
        if (profileRow && profileRow.role === 'issuer') {
          navigate('/app/dashboard', { replace: true })
          return
        }
        setCurrentUser(session.user)
        checkVault(session.user.id)
        loadCredentials(session.user)
      }
    }
    init()
    return () => { active = false }
  }, [navigate, checkVault, loadCredentials])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        return  // preserve state, do not reload
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser) return
    
    try {
      setIsUnlocking(true)
      setUnlockError(null)

      // Unlock ZK-Vault using PIN
      const success = await unlockWithPin(pinInput, currentUser.id)
      if (success) {
        setShowUnlockModal(false)
        setIsUnlocking(false)
      } else {
        setUnlockError('Vault unlock failed. Please check your PIN.')
        setIsUnlocking(false)
      }
    } catch {
      setUnlockError('Unlock encountered an error. Please try again.')
      setIsUnlocking(false)
    }
  }

  const handleUnlockWithPasskeyClick = async () => {
    if (!currentUser) return
    try {
      setIsUnlocking(true)
      setUnlockError(null)

      const success = await unlockWithPasskey(currentUser.id)
      if (success) {
        setShowUnlockModal(false)
        setIsUnlocking(false)
      } else {
        setUnlockError('Passkey authentication failed.')
        setIsUnlocking(false)
      }
    } catch {
      setUnlockError('Passkey encounter error.')
      setIsUnlocking(false)
    }
  }

  // --- VIEW DETAILS PANEL DECRYPTION ---
  const handleToggleDetails = async (cred: Credential) => {
    if (expandedCredId === cred.id) {
      setExpandedCredId(null)
      return
    }

    setExpandedCredId(cred.id)
    
    // Clear previous details if changing credentials
    if (!decryptedFields[cred.id] && isUnlocked) {
      await decryptCredDetails(cred)
    }
  }

  const decryptCredDetails = async (cred: Credential) => {
    try {
      setDecryptingCredId(cred.id)
      let sdjwtString = ''

      if (cred.cipher && cred.iv) {
        // Fallback schema.sql: Decrypt using cipher and iv
        const decrypted = await decryptPayload({ cipher: cred.cipher, iv: cred.iv }) as { sdjwt: string }
        sdjwtString = decrypted.sdjwt
      } else {
        // Prompt custom schema: Decrypt the parsed sd_jwt JSON string
        const parsedPayload = JSON.parse(cred.sd_jwt)
        const decrypted = await decryptPayload(parsedPayload) as { sdjwt: string }
        sdjwtString = decrypted.sdjwt
      }

      // Parse the SD-JWT claims using sdjwt readDisclosures
      const disclosures = readDisclosures(sdjwtString)
      const fields: Record<string, any> = {
        rawJwt: sdjwtString
      }

      // Populate decrypted fields matching claims
      disclosures.forEach(d => {
        fields[d.name] = d.value
      })

      // Try fallback from headers if name/degree disclosures aren't explicitly inside the salt disclosures
      if (!fields.name) {
        try {
          const payload = JSON.parse(atob(sdjwtString.split('~')[0].split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
          fields.name = payload.name || ''
          fields.degree = payload.degree || ''
          fields.institution = payload.institution || ''
          fields.year = payload.year || ''
        } catch {}
      }

      setDecryptedFields(prev => ({ ...prev, [cred.id]: fields }))
    } catch {
      showToast('Decryption failed')
    } finally {
      setDecryptingCredId(null)
    }
  }

  const triggerUnlockForDetails = async () => {
    setPinInput('')
    setUnlockError(null)

    if (unlockMethod === 'passkey' || unlockMethod === 'biometric') {
      // Skip modal entirely — fire biometric directly
      try {
        setIsUnlocking(true)
        const success = await unlockWithPasskey(currentUser!.id)
        if (!success) {
          // Only show modal on failure so user can try again
          setUnlockError('Biometric authentication failed. Try again.')
          setShowUnlockModal(true)
        }
      } catch {
        setUnlockError('Biometric failed. Try again.')
        setShowUnlockModal(true)
      } finally {
        setIsUnlocking(false)
      }
    } else {
      // PIN or both — show modal as normal
      setShowUnlockModal(true)
    }
  }

  // Effect to decrypt detail panel automatically when vault is unlocked post-hoc
  useEffect(() => {
    if (isUnlocked && expandedCredId && !decryptedFields[expandedCredId]) {
      const target = claimedCredentials.find(c => c.id === expandedCredId)
      if (target) {
        decryptCredDetails(target)
      }
    }
  }, [isUnlocked, expandedCredId, claimedCredentials, decryptedFields])



  // Truncate helper
  const truncateDid = (did: string) => {
    if (!did) return 'Unknown'
    if (did.length <= 32) return did
    return did.slice(0, 32) + '...'
  }

  return (
    <div className="w-full md:max-w-4xl mx-auto pb-24 px-4 md:px-0">
      <style>{spinStyles}</style>

      {/* Header and top buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">My wallet</h2>
          <p className="text-sm text-stone-500 mt-1">
            Your digital credentials, encrypted and controlled by you
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          {/* Vault Status pill */}
          {!vaultStatusLoading && (
            <div className="flex justify-stretch sm:justify-end">
              {vaultExists === false && (
                <button className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold h-11 px-4 rounded-lg text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer flex items-center justify-center" onClick={() => navigate('/app/vault-setup')}>
                  Vault not set up (Setup)
                </button>
              )}
              {vaultExists === true && !isUnlocked && (
                <span className="w-full sm:w-auto text-center px-4 py-2.5 bg-gray-100 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg">
                  Vault locked
                </span>
              )}
              {vaultExists === true && isUnlocked && (
                <span className="w-full sm:w-auto text-center px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-lg">
                  Vault unlocked
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main loading spinner */}
      {loading && claimedCredentials.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-stone-500 mt-4 font-medium">Loading credentials...</p>
        </div>
      )}

      {!loading && !loadError && (
        <div>
          {/* =======================================================
              SECTION B: CLAIMED CREDENTIALS
             ======================================================= */}
          <div>
            <div className="mb-4">
              <h3 className="text-lg font-bold text-stone-900">
                My Encrypted Credentials
              </h3>
              <p className="text-sm text-stone-500 mt-1">
                Click <span className="font-semibold text-indigo-600">Share</span> on any credential to generate a unique share link.
              </p>
            </div>

            {/* Empty State */}
            {claimedCredentials.length === 0 && (
              <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-8 md:p-12 text-center">
                <div className="text-5xl mb-4 text-stone-300">💼</div>
                <h3 className="text-lg font-bold text-stone-900">No credentials yet</h3>
                <p className="text-sm text-stone-500 max-w-sm mx-auto mb-6 mt-2 leading-relaxed">
                  Your institution will issue credentials to you. You can check notifications to view and claim pending certificates.
                </p>
                <button 
                  className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 px-6 rounded-lg text-sm cursor-pointer" 
                  onClick={() => navigate('/app/notifications')}
                >
                  View pending notifications
                </button>
              </div>
            )}

            {/* Claimed List */}
            {claimedCredentials.length > 0 && (
              <div className="flex flex-col gap-4">
                {claimedCredentials.map((c) => {
                  const isExpanded = expandedCredId === c.id
                  const detail = decryptedFields[c.id]
                  
                  return (
                    <div 
                      key={c.id}
                      className="border-l-4 border-indigo-600 overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white rounded-xl border border-gray-200"
                    >
                      {/* Card Content Wrapper */}
                      <div className="p-4 md:p-6">
                        {/* Top row */}
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-4">
                          <div>
                            <strong className="text-base text-gray-900 block font-bold leading-snug">
                              {c.institution_name ? `${c.institution_name} — ` : ''}{c.degree_title}
                            </strong>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {c.institution_name || 'Encrypted Certificate'}
                            </div>
                          </div>
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 shrink-0">✓ Verified</span>
                        </div>

                        {/* Middle row */}
                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-6 text-xs text-gray-500 mb-4 pb-4 border-b border-gray-100">
                          <div>
                            <span>Issued by: </span>
                            <code className="font-mono text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded text-[10px] break-all">
                              {c.issuer_did ? truncateDid(c.issuer_did) : 'did:web:...'}
                            </code>
                          </div>
                          <div className="flex gap-4">
                            <div>
                              <span>Year: </span>
                              <strong className="text-gray-950">
                                {detail?.year
                                  || (detail?.graduation_date ? new Date(detail.graduation_date).getFullYear().toString() : null)
                                  || (c.graduation_date ? new Date(c.graduation_date).getFullYear().toString() : '—')}
                              </strong>
                            </div>
                            <div>
                              <span>Issued on: </span>
                              <strong className="text-gray-950">{new Date(c.created_at).toLocaleDateString()}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Bottom action row */}
                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <div className="relative group w-full sm:w-auto">
                            <button 
                              onClick={() => navigate(`/app/share/${c.id}`)}
                              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 px-6 rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer"
                            >
                              Share
                            </button>
                            
                            {/* Premium CSS Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 hidden group-hover:block bg-stone-900 text-white text-xs rounded-lg p-2.5 shadow-xl z-20 pointer-events-none text-center">
                              <div className="font-semibold mb-0.5 flex items-center justify-center gap-1 text-[11px]">
                                <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Single Credential Share</span>
                              </div>
                              <p className="text-[10px] text-stone-300 leading-normal">
                                Generates a secure, verifiable link specific to this credential.
                              </p>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-stone-900"></div>
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => handleToggleDetails(c)}
                            disabled={decryptingCredId === c.id}
                            className="w-full sm:w-auto border border-indigo-600 bg-transparent hover:bg-indigo-50 active:bg-indigo-100 text-indigo-600 font-semibold h-11 px-6 rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {decryptingCredId === c.id && (
                              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-indigo-200 border-t-indigo-600" />
                            )}
                            <span>{isExpanded ? 'Hide details' : 'View details'}</span>
                          </button>
                        </div>
                                           {/* --- INLINE DETAILS PANEL --- */}
                      {isExpanded && (
                        <div className="border-t border-stone-200 bg-stone-50/60 p-5 md:p-8 text-sm text-left">
                          <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">
                            Certificate Metadata View
                          </p>

                          {!isUnlocked ? (
                            <div className="text-center py-4">
                              <p className="text-sm text-stone-500 mb-4">
                                This credential is encrypted. Unlock your vault to view the verified claims.
                              </p>
                              <button 
                                className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-300 text-white font-semibold h-11 px-6 rounded-lg text-sm cursor-pointer flex items-center justify-center gap-2"
                                onClick={triggerUnlockForDetails}
                                disabled={isUnlocking}
                              >
                                {isUnlocking ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-indigo-200 border-t-white" />
                                    <span>Authenticating...</span>
                                  </>
                                ) : (
                                  <span>Unlock vault to view details</span>
                                )}
                              </button>
                            </div>
                          ) : decryptingCredId === c.id ? (
                            <div className="flex flex-col items-center justify-center py-6">
                              <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600" />
                              <p className="text-stone-500 mt-2 text-xs font-medium">Decrypting claims from vault...</p>
                            </div>
                          ) : detail ? (
                            <div className="space-y-6">
                              
                              {/* Student Document at top, centered */}
                              <div className="flex flex-col items-center justify-center mb-8 relative group">
                                {detail.photo ? (
                                  <>
                                    <div className="border border-stone-200 rounded p-1 bg-white shadow-sm shrink-0 flex flex-col items-center justify-center overflow-hidden w-full max-w-4xl relative">
                                      {detail.photo.startsWith('data:application/pdf') || detail.photo.endsWith('.pdf') ? (
                                        <object 
                                          data={detail.photo} 
                                          type="application/pdf" 
                                          className="w-full aspect-[1.414/1] rounded"
                                        >
                                          <div className="p-8 text-center text-stone-500 text-sm flex flex-col items-center justify-center h-full bg-stone-50">
                                            <span className="text-3xl mb-3">📄</span>
                                            <p>Your browser does not support viewing PDFs directly.</p>
                                            <a 
                                              href={detail.photo} 
                                              download={`document-${c.id.substring(0, 8)}.pdf`} 
                                              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors inline-block"
                                            >
                                              Download PDF Document
                                            </a>
                                          </div>
                                        </object>
                                      ) : (
                                        <img 
                                          src={detail.photo.startsWith('data:') || detail.photo.startsWith('http') ? detail.photo : `data:image/jpeg;base64,${detail.photo}`} 
                                          alt="Student Document" 
                                          className="w-full h-auto object-contain rounded" 
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                            const parent = target.parentElement;
                                            if (parent) {
                                              const fallback = document.createElement('div');
                                              fallback.className = 'p-6 text-center text-stone-500 text-xs';
                                              fallback.innerHTML = `
                                                <span class="text-2xl mb-2 block">⚠️</span>
                                                Failed to load document preview.
                                                <br/><a href="${detail.photo}" download="document" class="text-indigo-600 font-bold hover:underline mt-2 inline-block">Download File</a>
                                              `;
                                              parent.appendChild(fallback);
                                            }
                                          }}
                                        />
                                      )}
                                    </div>
                                    
                                    <div className="mt-4 w-full max-w-4xl flex justify-end">
                                      <button 
                                        onClick={() => {
                                          const w = window.open('');
                                          if (w) {
                                            w.document.write('<!DOCTYPE html><html><head><title>Document Viewer</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;background:#1c1917;height:100vh;overflow:hidden;">');
                                            if (detail.photo.startsWith('data:application/pdf') || detail.photo.endsWith('.pdf')) {
                                              w.document.write(`<iframe src="${detail.photo}" frameborder="0" style="border:0; width:100%; height:100%;" allowfullscreen></iframe>`);
                                            } else {
                                              const imgSrc = detail.photo.startsWith('data:') || detail.photo.startsWith('http') ? detail.photo : `data:image/jpeg;base64,${detail.photo}`;
                                              w.document.write(`<img src="${imgSrc}" style="max-width:100%;max-height:100%;object-fit:contain;" />`);
                                            }
                                            w.document.write('</body></html>');
                                            w.document.close();
                                          } else {
                                            const a = document.createElement('a');
                                            a.href = detail.photo;
                                            a.target = '_blank';
                                            a.click();
                                          }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-semibold border border-stone-200 transition-colors shadow-sm cursor-pointer"
                                      >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                        </svg>
                                        View Full Screen
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <div className="w-24 h-36 bg-stone-150 border border-dashed border-stone-300 rounded flex flex-col items-center justify-center text-stone-400 font-medium text-[10px]">
                                    <span className="text-xl mb-1">📄</span>
                                    <span>No Document</span>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Student Information */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest border-b border-stone-250 pb-1">
                                    Student Information
                                  </h4>
                                  <div className="space-y-2 text-xs">
                                    <div className="flex justify-between md:grid md:grid-cols-3 gap-2">
                                      <span className="text-stone-500">Name:</span>
                                      <span className="font-semibold text-stone-900 md:col-span-2 text-right md:text-left">
                                        {detail.name || '—'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between md:grid md:grid-cols-3 gap-2">
                                      <span className="text-stone-500">Email:</span>
                                      <span className="font-semibold text-stone-900 md:col-span-2 text-right md:text-left break-all">
                                        {detail.email || c.holder_email || '—'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between md:grid md:grid-cols-3 gap-2">
                                      <span className="text-stone-500">Student ID:</span>
                                      <span className="font-semibold text-stone-900 md:col-span-2 text-right md:text-left font-mono">
                                        {detail.student_id || '—'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Credential Information */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest border-b border-stone-250 pb-1">
                                    Credential Information
                                  </h4>
                                  <div className="space-y-2 text-xs">
                                    <div className="flex justify-between md:grid md:grid-cols-3 gap-2">
                                      <span className="text-stone-500">Degree Type:</span>
                                      <span className="font-semibold text-stone-900 md:col-span-2 text-right md:text-left">
                                        {detail.degree_type || '—'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between md:grid md:grid-cols-3 gap-2">
                                      <span className="text-stone-500">Major:</span>
                                      <span className="font-semibold text-stone-900 md:col-span-2 text-right md:text-left">
                                        {detail.major || '—'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between md:grid md:grid-cols-3 gap-2">
                                      <span className="text-stone-500">Graduation Date:</span>
                                      <span className="font-semibold text-stone-900 md:col-span-2 text-right md:text-left">
                                        {formatDate(detail.graduation_date)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between md:grid md:grid-cols-3 gap-2">
                                      <span className="text-stone-500">Certificate ID:</span>
                                      <span className="font-semibold text-stone-900 md:col-span-2 text-right md:text-left font-mono">
                                        {detail.certificate_id || '—'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between md:grid md:grid-cols-3 gap-2">
                                      <span className="text-stone-500">Issued by:</span>
                                      <span className="font-semibold text-stone-900 md:col-span-2 text-right md:text-left">
                                        {detail.institution || c.institution_name || '—'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between md:grid md:grid-cols-3 gap-2">
                                      <span className="text-stone-500">Issuer DID:</span>
                                      <span className="font-mono text-stone-600 text-[10px] md:col-span-2 text-right md:text-left break-all select-all">
                                        {detail.iss || c.issuer_did || '—'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Encryption Status Badge */}
                              <div className="pt-4 border-t border-stone-200 flex flex-wrap justify-between items-center gap-2">
                                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-250 px-2.5 py-1 rounded text-xs uppercase tracking-wider">
                                  ✓ Encrypted in your vault
                                </span>
                                
                                {/* Raw Collapsible */}
                                <button
                                  type="button"
                                  onClick={() => setExpandedRawJwts(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                                  className="text-xs font-semibold text-indigo-650 hover:underline cursor-pointer"
                                >
                                  {expandedRawJwts[c.id] ? 'Hide raw token' : 'Show raw token'}
                                </button>
                              </div>

                              {expandedRawJwts[c.id] && (
                                <div className="p-3 bg-white border border-stone-200 rounded-lg">
                                  <code className="font-mono text-[10px] block overflow-x-auto whitespace-pre-wrap break-all leading-relaxed text-stone-600">
                                    {detail.rawJwt}
                                  </code>
                                </div>
                              )}

                            </div>
                          ) : (
                            <p className="text-center text-sm text-stone-400 py-4">No decrypted claims found.</p>
                          )}
                        </div>
                      )}</div>

                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =======================================================
          MODAL 1: UNLOCK VAULT DIALOG
         ======================================================= */}
      {showUnlockModal && (
        <div className="fixed inset-0 bg-black/40 flex items-stretch md:items-center justify-end md:justify-center z-[100] p-0 md:p-4 flex-col">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-lg p-6 md:p-8 w-full max-w-sm flex flex-col pb-8 md:pb-8 animate-scale-in">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🔒</div>
              <h3 className="text-lg font-bold text-stone-900">Unlock Your Vault</h3>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                Your encryption keys are derived locally. Please unlock your vault to process this credential.
              </p>
            </div>

            {unlockMethod === 'pin' && (
              <form onSubmit={handleUnlockSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-semibold text-stone-700">Enter Vault PIN</label>
                  <input
                    type="password"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="••••"
                    required
                    className="w-full text-center text-lg tracking-widest font-semibold h-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {unlockError && (
                  <p className="text-red-600 text-xs text-center font-semibold mb-2">
                    {unlockError}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={isUnlocking}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 rounded-lg text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isUnlocking && (
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-indigo-200 border-t-white" />
                    )}
                    <span>Unlock with PIN</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowUnlockModal(false)
                    }}
                    disabled={isUnlocking}
                    className="w-full text-gray-500 font-semibold h-11 rounded-lg text-sm flex items-center justify-center cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {(unlockMethod === 'passkey' || unlockMethod === 'biometric') && (
              <div className="flex flex-col gap-3 items-center text-center">
                {isUnlocking ? (
                  <>
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600 my-2" />
                    <p className="text-sm font-semibold text-stone-800">
                      Authenticating...
                    </p>
                    <p className="text-xs text-stone-500">
                      Complete the biometric prompt on your device
                    </p>
                  </>
                ) : (
                  <>
                    {unlockError && (
                      <p className="text-red-600 text-xs font-semibold mb-1">
                        {unlockError}
                      </p>
                    )}
                    <p className="text-sm text-stone-500 mb-1">
                      Biometric prompt did not appear.
                    </p>
                    <button
                      type="button"
                      onClick={handleUnlockWithPasskeyClick}
                      disabled={isUnlocking}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold h-11 rounded-lg text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Try again
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => { setShowUnlockModal(false); setUnlockError(null) }}
                  disabled={isUnlocking}
                  className="w-full text-gray-400 text-sm h-10 flex items-center justify-center cursor-pointer"
                  style={{ opacity: isUnlocking ? 0.4 : 1 }}
                >
                  Cancel
                </button>
              </div>
            )}

            {(unlockMethod === 'both' || unlockMethod === null) && (
              <form onSubmit={handleUnlockSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-semibold text-stone-700">Enter Vault PIN</label>
                  <input
                    type="password"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="••••"
                    required
                    className="w-full text-center text-lg tracking-widest font-semibold h-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {unlockError && (
                  <p className="text-red-600 text-xs text-center font-semibold mb-2">
                    {unlockError}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={isUnlocking}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 rounded-lg text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isUnlocking && (
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-indigo-200 border-t-white" />
                    )}
                    <span>Unlock with PIN</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleUnlockWithPasskeyClick}
                    disabled={isUnlocking}
                    className="w-full border border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold h-11 rounded-lg text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>🔑 Unlock with Passkey</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowUnlockModal(false)
                    }}
                    disabled={isUnlocking}
                    className="w-full text-gray-500 font-semibold h-11 rounded-lg text-sm flex items-center justify-center cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =======================================================
          MODAL 2: SETUP NEEDED DIALOG
         ======================================================= */}
      {showSetupNeededModal && (
        <div className="fixed inset-0 bg-black/40 flex items-stretch md:items-center justify-end md:justify-center z-[100] p-0 md:p-4 flex-col">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-lg p-6 md:p-8 w-full max-w-sm flex flex-col pb-8 md:pb-8 animate-scale-in">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🛡️</div>
              <h3 className="text-lg font-bold text-stone-900">Encryption Vault Required</h3>
              <p className="text-xs text-stone-500 mt-2 leading-relaxed">
                To claim credentials, you must first create an encrypted browser vault. This derives keys locally to secure your data so that Supabase only stores ciphertext.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 rounded-lg text-sm flex items-center justify-center cursor-pointer"
                onClick={() => {
                  setShowSetupNeededModal(false)
                  navigate('/app/vault-setup')
                }}
              >
                Set up vault
              </button>

              <button
                className="w-full text-gray-500 font-semibold h-11 rounded-lg text-sm flex items-center justify-center cursor-pointer"
                onClick={() => setShowSetupNeededModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toastMessage && (
        <div className="fixed bottom-24 right-4 md:right-6 bg-stone-900 text-white px-4 py-2.5 rounded-lg shadow-lg z-[1000] text-sm font-semibold animate-scale-in">
          {toastMessage}
        </div>
      )}
    </div>
  )
}
