import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useZkVault } from '../../vault/zk-vault'
import { Bell, ArrowLeft, Inbox } from 'lucide-react'

interface PendingCredential {
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
  cipher?: string
  iv?: string
}

export default function Notifications() {
  const navigate = useNavigate()
  const { 
    isUnlocked, 
    checkVaultStatus, 
    unlockWithPin, 
    unlockWithPasskey, 
    encryptPayload 
  } = useZkVault()

  // State
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [pendingList, setPendingList] = useState<PendingCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Vault configuration status
  const [vaultExists, setVaultExists] = useState<boolean | null>(null)
  const [unlockMethod, setUnlockMethod] = useState<'pin' | 'passkey' | 'biometric' | 'both' | null>(null)

  // Modal / Action state
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [unlockTargetCred, setUnlockTargetCred] = useState<PendingCredential | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [showSetupNeededModal, setShowSetupNeededModal] = useState(false)

  const [claimingCredId, setClaimingCredId] = useState<string | null>(null)
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({})

  // Helper: Toast
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Check vault configuration and fetch unlock method
  const checkVault = useCallback(async (userId: string) => {
    try {
      const status = await checkVaultStatus(userId)
      if (status.status === 'ok') {
        setVaultExists(status.exists)
      } else {
        setVaultExists(false)
      }

      // Query vaults
      const { data: vaultData } = await supabase
        .from('vaults')
        .select('unlock_method')
        .eq('user_id', userId)
        .maybeSingle()

      if (vaultData && vaultData.unlock_method) {
        setUnlockMethod(vaultData.unlock_method as 'pin' | 'passkey' | 'both')
      } else {
        // Fallback to profiles table
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
    }
  }, [checkVaultStatus])

  // Fetch pending list
  const loadPending = useCallback(async (user: any) => {
    try {
      setLoading(true)
      setLoadError(false)

      // Query pending_credentials directly (schema.sql — issuers insert here, students claim from here)
      const fallbackUnclaimed = await supabase
        .from('pending_credentials')
        .select('*')
        .eq('recipient_email', user.email.toLowerCase())
        .order('created_at', { ascending: false })

      if (fallbackUnclaimed.error) throw fallbackUnclaimed.error

      const unclaimedList: PendingCredential[] = (fallbackUnclaimed.data || []).map((p: any) => ({
        id: p.id,
        issuer_id: '',
        holder_id: null,
        holder_email: p.recipient_email || p.student_email || user.email,
        issuer_did: p.issuer_did,
        institution_name: p.institution_name || '',
        degree_title: p.label || p.degree_type || 'Degree Certificate',
        sd_jwt: p.sdjwt,
        claimed: false,
        claimed_at: null,
        created_at: p.created_at
      }))

      setPendingList(unclaimedList)
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
        loadPending(session.user)
      }
    }
    init()
    return () => { active = false }
  }, [navigate, checkVault, loadPending])

  // --- CLAIM FLOW ---
  const triggerClaimFlow = async (credential: PendingCredential) => {
    if (claimingCredId) return

    // Vault exists check
    if (!vaultExists) {
      setShowSetupNeededModal(true)
      return
    }

    // Unlock check
    if (!isUnlocked) {
      setUnlockTargetCred(credential)
      setPinInput('')
      setUnlockError(null)
      setShowUnlockModal(true)
      return
    }

    await executeClaim(credential)
  }

  const handleUnlockAndClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!unlockTargetCred || !currentUser) return

    try {
      setIsUnlocking(true)
      setUnlockError(null)

      const success = await unlockWithPin(pinInput, currentUser.id)
      if (success) {
        setShowUnlockModal(false)
        setIsUnlocking(false)
        await executeClaim(unlockTargetCred)
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
    if (!unlockTargetCred || !currentUser) return
    try {
      setIsUnlocking(true)
      setUnlockError(null)

      const success = await unlockWithPasskey(currentUser.id)
      if (success) {
        setShowUnlockModal(false)
        setIsUnlocking(false)
        await executeClaim(unlockTargetCred)
      } else {
        setUnlockError('Passkey authentication failed.')
        setIsUnlocking(false)
      }
    } catch {
      setUnlockError('Passkey encounter error.')
      setIsUnlocking(false)
    }
  }

  const executeClaim = async (cred: PendingCredential) => {
    setClaimingCredId(cred.id)
    setClaimErrors(prev => ({ ...prev, [cred.id]: '' }))

    try {
      const payload = { sdjwt: cred.sd_jwt }
      const encryptedPayload = await encryptPayload(payload)
      const encryptedStr = JSON.stringify(encryptedPayload)

      let updateRes

      // Fallback schema detection
      const isFallback = (cred.cipher !== undefined || cred.iv !== undefined) || (!cred.sd_jwt) || (cred.issuer_id === '')

      if (isFallback) {
        updateRes = await supabase.from('credentials').insert({
          owner: currentUser.id,
          label: cred.degree_title,
          cipher: encryptedPayload.cipher,
          iv: encryptedPayload.iv
        })

        if (!updateRes.error) {
          await supabase.from('pending_credentials').delete().eq('id', cred.id)
        }
      } else {
        updateRes = await supabase
          .from('credentials')
          .update({
            sd_jwt: encryptedStr,
            claimed: true,
            claimed_at: new Date().toISOString()
          })
          .eq('id', cred.id)
      }

      if (updateRes.error) {
        throw new Error('Credential encrypted but failed to save. Please try again.')
      }

      setPendingList(prev => prev.filter(c => c.id !== cred.id))
      showToast('Credential claimed and encrypted successfully!')
    } catch (err: any) {
      setClaimErrors(prev => ({ ...prev, [cred.id]: err.message || 'Claim failed' }))
    } finally {
      setClaimingCredId(null)
    }
  }

  const truncateDid = (did: string) => {
    if (!did) return 'Unknown'
    if (did.length <= 32) return did
    return did.slice(0, 32) + '...'
  }

  return (
    <div className="w-full md:max-w-2xl mx-auto pb-24 px-4 md:px-0">
      {/* Back Link */}
      <Link to="/app/wallet" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-indigo-600 transition-colors mb-6">
        <ArrowLeft size={16} />
        Back to wallet
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="bg-indigo-100 text-indigo-600 p-2.5 rounded-xl">
          <Bell size={24} />
        </div>
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">Notifications</h2>
          <p className="text-sm text-stone-500 mt-0.5">
            Claim credentials issued to your Cambodian digital identity
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-stone-500 mt-4 font-medium">Checking pending credentials...</p>
        </div>
      )}

      {loadError && !loading && (
        <div className="w-full bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-center shadow-sm">
          <h3 className="font-semibold text-red-900 text-lg mb-2">Failed to load notifications</h3>
          <p className="text-sm text-red-700 mb-4">Please refresh the page to try again.</p>
          <button className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold h-11 px-6 rounded-lg text-sm transition-colors cursor-pointer" onClick={() => loadPending(currentUser)}>
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <div className="space-y-4">
          {pendingList.length === 0 ? (
            <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 mb-4">
                <Inbox size={32} />
              </div>
              <h3 className="text-lg font-bold text-stone-900">All caught up!</h3>
              <p className="text-sm text-stone-500 max-w-sm mx-auto mt-2 leading-relaxed">
                You have no pending credentials to claim at this time. Institutions will issue digital certificates directly to your identity.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingList.map((c) => (
                <div 
                  key={c.id}
                  className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-gray-200 shadow-sm rounded-xl p-5 gap-4 hover:border-indigo-100 transition-colors"
                >
                  <div className="flex-1">
                    <strong className="text-sm md:text-base text-gray-900 block font-semibold leading-snug">
                      {c.institution_name ? `${c.institution_name} — ` : ''}{c.degree_title}
                    </strong>
                    <div className="text-xs text-gray-500 mt-1">
                      Issued by: <code className="font-mono text-[10px] text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded break-all">{truncateDid(c.issuer_did)}</code>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0">
                    <span className="text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => triggerClaimFlow(c)}
                      disabled={claimingCredId !== null}
                      className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 px-5 rounded-lg text-xs md:text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      {claimingCredId === c.id && (
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-indigo-200 border-t-white" />
                      )}
                      <span>Claim to Vault</span>
                    </button>
                  </div>

                  {claimErrors[c.id] && (
                    <div className="w-full bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2.5 mt-2">
                      Claim failed: {claimErrors[c.id]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
              <form onSubmit={handleUnlockAndClaimSubmit} className="flex flex-col gap-3">
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
                    <span>Unlock & Claim</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowUnlockModal(false)
                      setUnlockTargetCred(null)
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
              <div className="flex flex-col gap-3">
                <div className="text-center py-4 text-sm text-stone-600">
                  {unlockMethod === 'biometric'
                    ? 'Authenticate using your secure local biometrics.'
                    : 'Authenticate using your secure device passkey.'}
                </div>

                {unlockError && (
                  <p className="text-red-600 text-xs text-center font-semibold mb-2">
                    {unlockError}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleUnlockWithPasskeyClick}
                    disabled={isUnlocking}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 rounded-lg text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isUnlocking && (
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-indigo-200 border-t-white" />
                    )}
                    <span>{unlockMethod === 'biometric' ? '👤 Unlock with Biometric' : '🔑 Unlock with Passkey'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowUnlockModal(false)
                      setUnlockTargetCred(null)
                    }}
                    disabled={isUnlocking}
                    className="w-full text-gray-500 font-semibold h-11 rounded-lg text-sm flex items-center justify-center cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {(unlockMethod === 'both' || unlockMethod === null) && (
              <form onSubmit={handleUnlockAndClaimSubmit} className="flex flex-col gap-3">
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
                    <span>Unlock & Claim</span>
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
                      setUnlockTargetCred(null)
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
          MODAL 2: VAULT SETUP NEEDED DIALOG
         ======================================================= */}
      {showSetupNeededModal && (
        <div className="fixed inset-0 bg-black/40 flex items-stretch md:items-center justify-end md:justify-center z-[100] p-0 md:p-4 flex-col">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-lg p-6 md:p-8 w-full max-w-sm flex flex-col pb-8 md:pb-8 animate-scale-in text-center">
            <div className="text-4xl mb-2">⚙️</div>
            <h3 className="text-lg font-bold text-stone-900">Vault setup required</h3>
            <p className="text-xs text-stone-500 mt-2 mb-6 leading-relaxed">
              Your digital credentials are encrypted locally for zero-knowledge privacy. You must set up your vault to store this certificate.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 rounded-lg text-sm flex items-center justify-center cursor-pointer"
                onClick={() => navigate('/app/vault-setup')}
              >
                Set up my vault
              </button>
              <button
                className="w-full border border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold h-11 rounded-lg text-sm flex items-center justify-center cursor-pointer"
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
