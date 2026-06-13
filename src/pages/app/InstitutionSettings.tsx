import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { 
  Building2, 
  Globe, 
  ShieldCheck, 
  ShieldAlert, 
  Award, 
  Copy, 
  Check, 
  Calendar, 
  ArrowRight
} from 'lucide-react'

interface IssuerInfo {
  id: string
  name: string
  domain: string
  type: string
  did: string
  accredited: boolean
  accredited_at: string | null
  revoked_at: string | null
  public_key: string | null
  created_at: string | null
  updated_at?: string | null
}

export default function InstitutionSettings() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [issuer, setIssuer] = useState<IssuerInfo | null>(null)

  // Copy indicators
  const [copiedKey, setCopiedKey] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const handleCopyPublicKey = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
      showToast('Copied to clipboard!')
    } catch {
      showToast('Failed to copy.')
    }
  }

  const fetchIssuerProfile = useCallback(async (user: any) => {
    try {
      setLoading(true)
      setLoadError(false)

      // Query standard "owner" column first
      let { data, error } = await supabase
        .from('issuers')
        .select('*')
        .eq('owner', user.id)
        .maybeSingle()

      // Fallback if owner column is missing in custom schema config
      if (error && (error.message.includes('owner') || error.code === '42703')) {
        const fallback = await supabase
          .from('issuers')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()
        data = fallback.data
        error = fallback.error
      }

      if (error) throw error

      if (data) {
        // Derive domain if not explicitly stored
        let domainVal = data.domain || ''
        if (!domainVal && data.did && data.did.startsWith('did:web:')) {
          domainVal = decodeURIComponent(data.did.substring(8))
        }

        // Parse key representation
        let keyVal = null
        if (data.public_key) {
          keyVal = data.public_key
        } else if (data.public_jwk) {
          keyVal = typeof data.public_jwk === 'string' ? data.public_jwk : JSON.stringify(data.public_jwk, null, 2)
        }

        setIssuer({
          id: data.id,
          name: data.name,
          domain: domainVal || 'Not Specified',
          type: data.type || 'University',
          did: data.did,
          accredited: !!data.accredited,
          accredited_at: data.accredited_at || null,
          revoked_at: data.revoked_at || null,
          public_key: keyVal,
          created_at: data.created_at || null,
          updated_at: data.updated_at || null
        })
      } else {
        setIssuer(null)
      }

      setLoading(false)
    } catch (err) {
      setLoadError(true)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        navigate('/auth/login', { replace: true })
        return
      }

      if (active) {
        setCurrentUser(session.user)
        fetchIssuerProfile(session.user)
      }
    }
    checkAuth()
    return () => { active = false }
  }, [navigate, fetchIssuerProfile])

  // Helper: Truncate long key strings for display
  const truncateKey = (key: string | null) => {
    if (!key) return ''
    if (key.length <= 60) return key
    return key.slice(0, 30) + ' ... ' + key.slice(-30)
  }

  // Visual status mapping
  const getAccreditationStatus = () => {
    if (!issuer) return null

    if (issuer.revoked_at) {
      return {
        label: 'Accreditation Revoked',
        desc: `Accreditation revoked on ${new Date(issuer.revoked_at).toLocaleDateString()}`,
        badgeStyle: 'bg-red-50 text-red-700 border-red-200',
        icon: <ShieldAlert size={20} className="text-red-500" />
      }
    }

    if (issuer.accredited) {
      return {
        label: 'Accredited',
        desc: `Approved by MoEYS${issuer.accredited_at ? ` on ${new Date(issuer.accredited_at).toLocaleDateString()}` : ''}`,
        badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: <ShieldCheck size={20} className="text-emerald-500" />
      }
    }

    return {
      label: 'Pending Approval',
      desc: 'Awaiting MoEYS approval',
      badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <Award size={20} className="text-amber-500" />
    }
  }

  const status = getAccreditationStatus()

  return (
    <div className="w-full md:max-w-3xl mx-auto pb-24 px-4 md:px-0">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">Institution Settings</h2>
        <p className="text-sm text-stone-500 mt-1">
          Manage your institution profile
        </p>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-stone-500 mt-4 font-medium">Loading settings...</p>
        </div>
      )}

      {loadError && !loading && (
        <div className="w-full bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-center shadow-sm">
          <h3 className="font-semibold text-red-900 text-lg mb-2">Failed to load profile</h3>
          <p className="text-sm text-red-700 mb-4">An error occurred while connecting to Supabase.</p>
          <button 
            className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold h-11 px-6 rounded-lg text-sm transition-colors cursor-pointer" 
            onClick={() => fetchIssuerProfile(currentUser)}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && !issuer && (
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 text-indigo-600 mb-4">
            <Building2 size={32} />
          </div>
          <h3 className="text-lg font-bold text-stone-900">No Institution Registered</h3>
          <p className="text-sm text-stone-500 max-w-sm mx-auto mt-2 mb-6 leading-relaxed">
            Your issuer profile has not been configured. To sign digital credentials on behalf of your institution, you must complete the registration first.
          </p>
          <button
            onClick={() => navigate('/app/register-issuer')}
            className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 px-6 rounded-lg text-sm flex items-center justify-center gap-1.5 mx-auto cursor-pointer shadow-sm"
          >
            <span>Register Institution</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {!loading && !loadError && issuer && (
        <div className="space-y-6">
          {/* Card A: Institution Profile Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-stone-900 tracking-tight mb-5 flex items-center gap-2">
              <Building2 size={18} className="text-indigo-500" />
              <span>Institution Profile</span>
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-gray-100 gap-4">
                <span className="text-gray-500 shrink-0">Official Name</span>
                <strong className="text-stone-900 font-semibold text-right">{issuer.name}</strong>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 gap-4">
                <span className="text-gray-500 shrink-0">Institutional Domain</span>
                <strong className="text-stone-900 font-medium flex items-center gap-1.5">
                  <Globe size={14} className="text-stone-400" />
                  <span>{issuer.domain}</span>
                </strong>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-500">Institution Type</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {issuer.type}
                </span>
              </div>
              <div className={`flex justify-between items-center py-2 ${issuer.updated_at ? 'border-b border-gray-100' : ''}`}>
                <span className="text-gray-500">Registered Date</span>
                <strong className="text-stone-900 font-medium flex items-center gap-1.5">
                  <Calendar size={14} className="text-stone-400" />
                  <span>{issuer.created_at ? new Date(issuer.created_at).toLocaleDateString() : 'N/A'}</span>
                </strong>
              </div>
              {issuer.updated_at && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-500">Updated Date</span>
                  <strong className="text-stone-900 font-medium flex items-center gap-1.5">
                    <Calendar size={14} className="text-stone-400" />
                    <span>{new Date(issuer.updated_at).toLocaleDateString()}</span>
                  </strong>
                </div>
              )}
            </div>
          </div>

          {/* Card B: Decentralized Identity (DID) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2">
                <Globe size={18} className="text-indigo-500" />
                <span>Decentralized Identifier (DID)</span>
              </h3>
            </div>

            <div className="space-y-1 mb-4">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                Decentralized Identifier (DID)
              </span>
              <code className="text-xs bg-stone-50 border border-stone-200 p-2.5 rounded block font-mono text-stone-600 break-all select-all leading-normal">
                {issuer.did}
              </code>
            </div>

            <p className="text-xs text-stone-500 leading-relaxed">
              <strong>Decentralized Identifier (DID):</strong> Your unique institutional identifier on Actik. It is standard did:web format bound to your institutional domain, allowing verifiers worldwide to cryptographically resolve your public signing keys.
            </p>
          </div>

          {/* Card C: Accreditation Status Card */}
          {status && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-bold text-stone-900 tracking-tight mb-5 flex items-center gap-2">
                <Award size={18} className="text-indigo-500" />
                <span>Accreditation Status</span>
              </h3>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border gap-4 bg-stone-50/50">
                <div className="flex items-center gap-3">
                  <div className="shrink-0">
                    {status.icon}
                  </div>
                  <div>
                    <strong className="text-stone-900 font-semibold text-sm block leading-snug">
                      {status.label}
                    </strong>
                    <span className="text-xs text-stone-500 mt-0.5 block">
                      {status.desc}
                    </span>
                  </div>
                </div>

                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${status.badgeStyle}`}>
                  {status.label}
                </span>
              </div>

              {!issuer.accredited && !issuer.revoked_at && (
                <div className="mt-4 bg-amber-50/50 border border-amber-200 text-amber-800 rounded-xl p-3.5 text-xs leading-relaxed flex gap-2">
                  <span className="text-base">⏳</span>
                  <p className="margin-0">
                    Your registration has been received successfully. Ministry of Education, Youth and Sport (MoEYS) administrators will review your credentials domain setup before approving your accreditation. You cannot issue credentials while pending approval.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Card D: Public Key Section */}
          {issuer.public_key && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2">
                  <Award size={18} className="text-indigo-500" />
                  <span>Public Key (for verification)</span>
                </h3>
                <button
                  onClick={() => handleCopyPublicKey(issuer.public_key || '')}
                  className="text-stone-500 hover:text-indigo-600 transition-colors flex items-center gap-1 text-xs font-semibold p-1 hover:bg-stone-50 rounded cursor-pointer"
                >
                  {copiedKey ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 mb-4">
                <code className="font-mono text-[10px] block overflow-x-auto text-gray-600 break-all leading-normal">
                  {truncateKey(issuer.public_key)}
                </code>
              </div>

              <p className="text-xs text-stone-500 leading-relaxed">
                <strong>Public Key (ES256):</strong> This key is public and used by verifiers to validate the signatures on certificates you issue. Your matching private signing key is derived in your browser session and is never shared or stored in the database.
              </p>
            </div>
          )}
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
