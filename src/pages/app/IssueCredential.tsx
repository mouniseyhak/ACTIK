import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { issueSdJwt } from '../../lib/sdjwt'

// Shared keyframe spinner animation
const spinStyles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`

interface IssuerInfo {
  name: string
  domain: string
  did: string
  accredited: boolean
  rawIssuerData: any
}

export default function IssueCredential() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  
  // Checking & Loading States
  const [checking, setChecking] = useState(true)
  const [issuerInfo, setIssuerInfo] = useState<IssuerInfo | null>(null)
  const [privateKey, setPrivateKey] = useState<any | null>(null)
  const [gateState, setGateState] = useState<'valid' | 'not_registered' | 'pending_approval' | 'session_expired'>('valid')

  // Form Fields
  const [studentEmail, setStudentEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [nationalId, setNationalId] = useState('')
  
  const [degreeTitle, setDegreeTitle] = useState('')
  const [completionYear, setCompletionYear] = useState(new Date().getFullYear().toString())
  const [gpa, setGpa] = useState('')
  const [notes, setNotes] = useState('')

  // Certificate document upload (PDF or image)
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [photoFileName, setPhotoFileName] = useState<string>('')
  const [photoError, setPhotoError] = useState<string>('')

  // Student Email Verification State
  const [checkingStudent, setCheckingStudent] = useState(false)
  const [studentFoundStatus, setStudentFoundStatus] = useState<'found' | 'not_found' | null>(null)
  const [studentUserId, setStudentUserId] = useState<string | null>(null)

  // Form Validation & Errors
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [issueSuccess, setIssueSuccess] = useState<boolean>(false)

  // Mount logic: Run all checks
  useEffect(() => {
    let active = true

    async function runGateChecks() {
      try {
        // Fetch session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session || !session.user) {
          navigate('/auth/login', { replace: true })
          return
        }
        
        if (active) {
          setCurrentUser(session.user)
        }

        // Check 1: Is user registered as an issuer?
        // Support both user_id and owner columns
        let { data: issuerData, error: issuerError } = await supabase
          .from('issuers')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (issuerError && (issuerError.message.includes('user_id') || issuerError.code === 'PGRST204')) {
          const fallback = await supabase
            .from('issuers')
            .select('*')
            .eq('owner', session.user.id)
            .maybeSingle()
          issuerData = fallback.data
          issuerError = fallback.error
        }

        if (!active) return

        if (!issuerData) {
          setGateState('not_registered')
          setChecking(false)
          return
        }

        if (issuerData.accredited === false) {
          setGateState('pending_approval')
          setChecking(false)
          return
        }

        // Check 2: Is the private key available in sessionStorage?
        const privateKeyJson = sessionStorage.getItem('issuer_private_key')
        const sessionDid = sessionStorage.getItem('issuer_did')
        
        if (!privateKeyJson || !sessionDid) {
          setGateState('session_expired')
          setChecking(false)
          return
        }

        // Save states
        setPrivateKey(JSON.parse(privateKeyJson))
        setIssuerInfo({
          name: issuerData.name,
          domain: issuerData.domain || '',
          did: issuerData.did || sessionDid,
          accredited: issuerData.accredited,
          rawIssuerData: issuerData
        })
        setGateState('valid')
        setChecking(false)
      } catch (err) {
        if (active) {
          setGateState('session_expired')
          setChecking(false)
        }
      }
    }

    runGateChecks()
    return () => { active = false }
  }, [navigate])

  // Look up student profile on email input blur
  const handleEmailBlur = async () => {
    const emailVal = studentEmail.trim().toLowerCase()
    if (!emailVal || !emailVal.includes('@')) return

    setCheckingStudent(true)
    setStudentFoundStatus(null)
    setStudentUserId(null)

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', emailVal)
        .maybeSingle()

      if (!error && data) {
        const uid = data.id
        setStudentUserId(uid)
        setStudentFoundStatus('found')
      } else {
        setStudentFoundStatus('not_found')
      }
    } catch {
      setStudentFoundStatus('not_found')
    } finally {
      setCheckingStudent(false)
    }
  }

  const validateForm = () => {
    const nextErrors: Record<string, string> = {}
    
    if (!studentEmail.trim() || !studentEmail.includes('@')) {
      nextErrors.studentEmail = 'A valid student email is required.'
    }
    if (fullName.trim().length < 2) {
      nextErrors.fullName = 'Student name must be at least 2 characters.'
    }
    if (degreeTitle.trim().length < 3) {
      nextErrors.degreeTitle = 'Degree title must be at least 3 characters.'
    }
    
    const yearNum = Number(completionYear)
    const currentYear = new Date().getFullYear()
    if (!completionYear || isNaN(yearNum) || yearNum < 1990 || yearNum > currentYear + 1) {
      nextErrors.completionYear = `Completion year must be a 4-digit number between 1990 and ${currentYear + 1}.`
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!issuerInfo || !privateKey) return
    if (!validateForm()) return
    if (checkingStudent) return // wait for lookup to finish

    try {
      setIsSubmitting(true)
      setSubmitError(null)

      // Step 1: Build the claims object (Khmer-text safe UTF-8)
      const claims: Record<string, any> = {
        sub: studentUserId ?? studentEmail.trim().toLowerCase(),
        name: fullName.trim(),
        degree: degreeTitle.trim(),
        institution: issuerInfo.name,
        year: Number(completionYear),
        iss: issuerInfo.did,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60 * 5) // 5 years expiry
      }

      if (gpa.trim()) claims.gpa = gpa.trim()
      if (nationalId.trim()) claims.national_id = nationalId.trim()
      if (notes.trim()) claims.notes = notes.trim()
      if (photoDataUrl) claims.photo = photoDataUrl

      // Step 2: Sign the SD-JWT
      // Note: Function name is issueSdJwt in our lib/sdjwt.ts exports, and takes IssueParams.
      const sdJwt = await issueSdJwt({
        issuerDid: issuerInfo.did,
        issuerPrivateJwk: privateKey,
        subject: claims,
        vct: 'https://actik.kh/credentials/degree',
        expiresInSec: 365 * 24 * 60 * 60 * 5
      })

      // Step 3: Save to Supabase (attempt custom user fields first, then fall back to pending_credentials)
      let res = await supabase.from('credentials').insert({
        issuer_id: currentUser.id,
        holder_id: studentUserId ?? null,
        holder_email: studentEmail.trim().toLowerCase(),
        issuer_did: issuerInfo.did,
        institution_name: issuerInfo.name,
        degree_title: degreeTitle.trim(),
        sd_jwt: sdJwt,
        claimed: false,
        created_at: new Date().toISOString()
      })

      // Fallback: If table schema matches schema.sql, insert as pending_credentials
      if (res.error && (res.error.message.includes('column') || res.error.code === '42703')) {
        res = await supabase.from('pending_credentials').insert({
          recipient_email: studentEmail.trim().toLowerCase(),
          sdjwt: sdJwt,
          issuer_did: issuerInfo.did,
          label: degreeTitle.trim()
        })
      }

      if (res.error) throw res.error

      setIssueSuccess(true)
      setIsSubmitting(false)
    } catch (err: any) {
      setSubmitError(err.message || 'Issuance failed. Please check details and try again.')
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setStudentEmail('')
    setFullName('')
    setNationalId('')
    setDegreeTitle('')
    setCompletionYear(new Date().getFullYear().toString())
    setGpa('')
    setNotes('')
    setStudentFoundStatus(null)
    setStudentUserId(null)
    setErrors({})
    setSubmitError(null)
    setIssueSuccess(false)
  }

  // --- GATES RENDERING ---

  // Main Mount Loading
  if (checking) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <style>{spinStyles}</style>
        <div style={{
          width: 40,
          height: 40,
          border: '4px solid var(--forest-soft)',
          borderTop: '4px solid var(--forest)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p className="muted" style={{ marginTop: '1rem' }}>Checking authorization...</p>
      </div>
    )
  }

  // Check 1 Fail: Not Registered
  if (gateState === 'not_registered') {
    return (
      <div className="w-full md:max-w-xl mx-auto px-4 md:px-0 pb-24">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl md:text-2xl font-bold text-stone-900 mb-2">Institution Not Registered</h2>
          <p className="text-sm text-stone-500 mb-6 leading-relaxed">
            You need to register your institution profile before you can access the credential issuance panel.
          </p>
          <button 
            className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-[52px] rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center cursor-pointer" 
            onClick={() => navigate('/app/register-issuer')}
          >
            Register institution
          </button>
        </div>
      </div>
    )
  }

  // Check 1 Fail: Pending Approval
  if (gateState === 'pending_approval') {
    return (
      <div className="w-full md:max-w-xl mx-auto px-4 md:px-0 pb-24">
        <div className="bg-white rounded-xl shadow-sm border border-amber-300 border-l-4 p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-bold text-amber-700 mb-2">Awaiting MoEYS Approval</h2>
          <p className="text-sm text-stone-500 mb-4 leading-relaxed">
            Your institution profile is registered, but it has not been accredited by MoEYS (Ministry of Education, Youth and Sport) yet.
          </p>
          <p className="text-xs text-stone-500 mb-6 italic">
            You cannot issue digital credentials until accreditation approval is granted.
          </p>
          <button 
            className="w-full border border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold h-[52px] rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center cursor-pointer" 
            onClick={() => navigate('/app/dashboard')}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  // Check 2 Fail: Session Expired (Private key cleared)
  if (gateState === 'session_expired') {
    return (
      <div className="w-full md:max-w-xl mx-auto px-4 md:px-0 pb-24">
        <div className="bg-white rounded-xl shadow-sm border border-red-300 border-l-4 p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-bold text-red-700 mb-2">Signing Session Expired</h2>
          <p className="text-sm text-stone-500 mb-4 leading-relaxed">
            Your cryptographic signing key is no longer available in this browser session. This happens when you close the tab, refresh the page, or the session timeout is reached.
          </p>
          <p className="text-xs text-stone-500 mb-6">
            Note: Your institution registration remains fully safe in the registry. You only need to sign back in with your Google account to reload the session key.
          </p>
          <button 
            className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-[52px] rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center cursor-pointer" 
            onClick={async () => {
              await supabase.auth.signOut()
              navigate('/auth/login', { replace: true })
            }}
          >
            Sign out and back in
          </button>
        </div>
      </div>
    )
  }

  // Success Screen
  if (issueSuccess) {
    return (
      <div className="w-full md:max-w-xl mx-auto px-4 md:px-0 pb-24">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 text-center">
          <div className="text-5xl text-emerald-500 mb-4">✓</div>
          <h2 className="text-xl md:text-2xl font-bold text-stone-900 mb-2">Credential Issued</h2>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-left text-sm space-y-3">
            <div>
              <span className="text-xs text-gray-400 block font-medium">Student Email</span>
              <strong className="text-gray-900 text-base">{studentEmail}</strong>
            </div>
            <div>
              <span className="text-xs text-gray-400 block font-medium">Degree Certificate</span>
              <strong className="text-gray-900">{degreeTitle}</strong>
            </div>
            <div>
              <span className="text-xs text-gray-400 block font-medium">Institution</span>
              <strong className="text-gray-900">{issuerInfo?.name}</strong>
            </div>
          </div>

          <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded text-left text-xs text-emerald-800 leading-relaxed mb-6">
            {studentFoundStatus === 'found' ? (
              <span>The student has an active account. They will instantly see this credential in their wallet and can claim it.</span>
            ) : (
              <span>The credential is saved in the pending registry. The student can claim it as soon as they sign up for an Actik account using this email address.</span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button 
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-[52px] rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center cursor-pointer" 
              onClick={handleReset}
            >
              Issue another credential
            </button>
            <button 
              className="w-full border border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold h-[52px] rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center cursor-pointer" 
              onClick={() => navigate('/app/dashboard')}
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Truncate DID helper
  const truncateDid = (didString: string) => {
    if (didString.length <= 30) return didString
    return didString.slice(0, 30) + '...'
  }

  // Form & Preview Screen
  return (
    <div className="w-full md:max-w-4xl mx-auto px-4 md:px-0 pb-24">
      <style>{spinStyles}</style>

      {/* Back button */}
      <div className="mb-4">
        <button
          onClick={() => navigate('/app/dashboard')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-indigo-600 transition-colors focus:outline-none cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to dashboard
        </button>
      </div>

      {/* Heading */}
      <div className="mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
          Issue a credential
        </h2>
        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
          Sign and send a digital certificate to a student.
        </p>
      </div>

      {/* Info Bar */}
      {issuerInfo && (
        <div className="inline-flex flex-wrap items-center bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 gap-2 max-w-full overflow-hidden">
          <span>Signing as:</span>
          <strong>{issuerInfo.name}</strong>
          <code className="mono bg-indigo-100/50 px-2 py-0.5 rounded text-[10px] break-all">
            {truncateDid(issuerInfo.did)}
          </code>
        </div>
      )}

      {/* Main Panel grid (Form on left, Preview on right) */}
      <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-6">
        
        {/* Form Card */}
        <div className="bg-transparent md:bg-white rounded-xl md:shadow-sm md:border md:border-gray-200 p-0 md:p-8">
          <form onSubmit={handleIssue} className="space-y-5">
            
            {/* Section A: Student Identity */}
            <h3 className="border-b border-gray-200 pb-2 text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider mt-2 mb-4">
              Student Section
            </h3>

            {/* Student Email */}
            <div>
              <label className="text-xs md:text-sm font-bold text-gray-700 block">Student email</label>
              <div className="relative mt-1">
                <input
                  type="email"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  onBlur={handleEmailBlur}
                  placeholder="student@example.com"
                  className="block w-full rounded-lg border border-gray-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900 pr-10"
                />
                {checkingStudent && (
                  <div className="absolute right-3 top-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-indigo-600" />
                  </div>
                )}
              </div>
              
              {/* Lookup notices */}
              {studentFoundStatus === 'found' && (
                <p className="text-emerald-600 text-xs mt-1 font-semibold">
                  ✓ Student account found
                </p>
              )}
              {studentFoundStatus === 'not_found' && (
                <p className="text-amber-600 text-xs mt-1 font-semibold italic leading-normal">
                  ⚠ No Actik account found with this email. The credential will be issued but the student cannot claim it until they sign up.
                </p>
              )}
              {errors.studentEmail && (
                <p className="text-red-600 text-xs mt-1 font-semibold">{errors.studentEmail}</p>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label className="text-xs md:text-sm font-bold text-gray-700 block">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Sokha Meng"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
              />
              {errors.fullName && (
                <p className="text-red-600 text-xs mt-1 font-semibold">{errors.fullName}</p>
              )}
            </div>

            {/* National ID */}
            <div>
              <label className="text-xs md:text-sm font-bold text-gray-700 block">National ID (optional)</label>
              <input
                type="text"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="123456789"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
              />
              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                This field will be hidden by default when the student shares their credential
              </p>
            </div>

            {/* Section B: Credential Details */}
            <h3 className="border-b border-gray-200 pb-2 text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider mt-6 mb-4">
              Credential Details
            </h3>

            {/* Degree Title */}
            <div>
              <label className="text-xs md:text-sm font-bold text-gray-700 block">Degree or certificate title</label>
              <input
                type="text"
                value={degreeTitle}
                onChange={(e) => setDegreeTitle(e.target.value)}
                placeholder="Bachelor of Information Technology"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
              />
              {errors.degreeTitle && (
                <p className="text-red-600 text-xs mt-1 font-semibold">{errors.degreeTitle}</p>
              )}
            </div>

            {/* Issuing Institution */}
            <div>
              <label className="text-xs md:text-sm font-bold text-gray-700 block">Issuing institution</label>
              <input
                type="text"
                value={issuerInfo?.name || ''}
                readOnly
                className="mt-1 block w-full rounded-lg border border-gray-200 px-3 h-11 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>

            {/* Year & GPA Row (Stacked on mobile, grid on desktop) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Completion Year */}
              <div>
                <label className="text-xs md:text-sm font-bold text-gray-700 block">Year of completion</label>
                <input
                  type="number"
                  value={completionYear}
                  onChange={(e) => setCompletionYear(e.target.value)}
                  min="1990"
                  max={(new Date().getFullYear() + 1).toString()}
                  placeholder="2024"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
                />
                {errors.completionYear && (
                  <p className="text-red-600 text-xs mt-1 font-semibold">{errors.completionYear}</p>
                )}
              </div>

              {/* GPA */}
              <div>
                <label className="text-xs md:text-sm font-bold text-gray-700 block">GPA / Grade (optional)</label>
                <input
                  type="text"
                  value={gpa}
                  onChange={(e) => setGpa(e.target.value)}
                  placeholder="3.8 / 4.0"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
                />
              </div>
            </div>

            {/* Additional Notes */}
            <div>
              <label className="text-xs md:text-sm font-bold text-gray-700 block">Additional notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Graduated with distinction. Major in Software Engineering."
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900 resize-vertical min-h-[80px]"
              />
            </div>

            {/* Certificate Document Upload */}
            <div>
              <label className="text-xs md:text-sm font-bold text-gray-700 block">
                Certificate document <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
                Upload a scan or PDF of the physical certificate. Accepted: PDF, JPG, PNG, WEBP.
              </p>

              {/* Drop zone / file picker */}
              <label
                htmlFor="cert-upload"
                className="flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-300 rounded-lg p-5 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
              >
                {photoDataUrl ? (
                  /* Preview after upload */
                  <div className="w-full space-y-2">
                    {photoDataUrl.startsWith('data:application/pdf') ? (
                      <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm">
                        <svg className="w-6 h-6 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        {photoFileName}
                      </div>
                    ) : (
                      <img
                        src={photoDataUrl}
                        alt="Certificate preview"
                        className="max-h-48 max-w-full mx-auto rounded object-contain border border-gray-200"
                      />
                    )}
                    <p className="text-[11px] text-center text-indigo-500 font-medium">Click to replace</p>
                  </div>
                ) : (
                  /* Empty state */
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-xs font-medium">Click to upload or drag & drop</span>
                    <span className="text-[11px]">PDF, JPG, PNG, WEBP</span>
                  </div>
                )}
                <input
                  id="cert-upload"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const MAX_MB = 5
                    if (file.size > MAX_MB * 1024 * 1024) {
                      setPhotoError(`File is too large. Maximum size is ${MAX_MB} MB.`)
                      return
                    }
                    setPhotoError('')
                    setPhotoFileName(file.name)
                    const reader = new FileReader()
                    reader.onload = (ev) => {
                      const result = ev.target?.result
                      if (typeof result === 'string') setPhotoDataUrl(result)
                    }
                    reader.readAsDataURL(file)
                    // Reset so same file can be re-selected
                    e.target.value = ''
                  }}
                />
              </label>

              {photoError && (
                <p className="text-red-600 text-xs mt-1 font-semibold">{photoError}</p>
              )}
              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => { setPhotoDataUrl(null); setPhotoFileName('') }}
                  className="mt-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Remove document
                </button>
              )}
            </div>

            {/* Submit Error */}
            {submitError && (
              <div className="w-full bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 font-medium">
                {submitError}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-[52px] rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting && (
                <svg 
                  className="animate-spin h-5 w-5 text-white"
                  fill="none" 
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              <span>Issue Credential</span>
            </button>

          </form>
        </div>

        {/* Live Preview Panel (Desktop-only md:block) */}
        <div className="hidden md:block">
          <h3 className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
            Credential Preview
          </h3>
          <div 
            className="bg-white rounded-xl shadow-sm border-2 border-indigo-150 p-6 min-h-[300px] flex flex-col justify-between relative overflow-hidden" 
            style={{
              backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(99,102,241,0.03) 0%, rgba(99,102,241,0) 80%)'
            }}
          >
            {/* Border frame */}
            <div className="absolute inset-2 border border-gray-100 opacity-60 pointer-events-none rounded-lg" />

            {/* Certificate content */}
            <div>
              <div className="flex justify-between items-start mb-6">
                <span className="text-lg font-bold text-indigo-700">
                  {issuerInfo?.name || 'Institution Name'}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-250">Accredited</span>
              </div>

              <div className="text-center my-6">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">
                  This certifies that
                </p>
                <p className="text-xl font-bold text-gray-900 mb-1">
                  {fullName.trim() || 'Student Full Name'}
                </p>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">
                  has completed the requirements for
                </p>
                <p className="text-base font-bold text-indigo-650">
                  {degreeTitle.trim() || 'Degree Certificate Title'}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-end border-t border-gray-100 pt-4 text-xs text-gray-500">
              <div>
                <div>Signed by issuer DID:</div>
                <code className="mono block text-[9px] mt-0.5 text-indigo-650">
                  {issuerInfo ? truncateDid(issuerInfo.did) : 'did:web:...'}
                </code>
              </div>
              <div className="text-right">
                <div>Year: <strong>{completionYear || '—'}</strong></div>
                {gpa.trim() && <div className="mt-0.5">GPA: <strong>{gpa}</strong></div>}
              </div>
            </div>

            {/* SD-JWT Badge */}
            <div className="absolute top-2.5 right-2.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-150">SD-JWT VC</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  )
}
