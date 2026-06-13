import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { generateIssuerKeys, didWeb } from '../../lib/did'
import { issueSdJwt, readDisclosures } from '../../lib/sdjwt'
import { compressFile, getFileSizeKB } from '../../lib/fileCompression'

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

  // Credential Issuance Form Fields
  const [studentPhoto, setStudentPhoto] = useState<string | null>(null)
  const [studentPhotoPreview, setStudentPhotoPreview] = useState<string | null>(null)
  const [studentEmail, setStudentEmail] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [degreeType, setDegreeType] = useState('Bachelor')
  const [major, setMajor] = useState('')
  const [graduationDate, setGraduationDate] = useState('')
  const [certificateId, setCertificateId] = useState('')
  const [issueErrors, setIssueErrors] = useState<Record<string, string>>({})
  const [issueSubmitError, setIssueSubmitError] = useState<string | null>(null)
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false)
  
  // Issuance Success State
  const [issuedSdJwt, setIssuedSdJwt] = useState<string | null>(null)

  // Student Email Verification State
  const [checkingStudent, setCheckingStudent] = useState(false)
  const [studentFoundStatus, setStudentFoundStatus] = useState<'found' | 'not_found' | null>(null)
  const [studentUserId, setStudentUserId] = useState<string | null>(null)

  // File Upload & Compression states
  const [isCompressing, setIsCompressing] = useState(false)
  const [originalSizeKB, setOriginalSizeKB] = useState<number | null>(null)
  const [compressedSizeKB, setCompressedSizeKB] = useState<number | null>(null)
  const [certType, setCertType] = useState<'image' | 'pdf' | null>(null)
  const [certMimeType, setCertMimeType] = useState<string | null>(null)
  const [pdfFilename, setPdfFilename] = useState<string | null>(null)
  const [compressedFileBlob, setCompressedFileBlob] = useState<Blob | null>(null)


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

        // Query issuers table (trying owner first as per schema.sql, fallback to user_id)
        let { data: issuerData, error: issuerError } = await supabase
          .from('issuers')
          .select('*')
          .eq('owner', session.user.id)
          .maybeSingle()

        if (issuerError && (issuerError.message.includes('owner') || issuerError.code === 'PGRST204')) {
          const fallback = await supabase
            .from('issuers')
            .select('*')
            .eq('user_id', session.user.id)
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

  // Look up student profile on email blur
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
        setStudentUserId(data.id)
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

  // Handle Certificate file upload and compression (supports JPG, PNG, WebP, PDF)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIssueErrors(prev => {
      const next = { ...prev }
      delete next.studentPhoto
      return next
    })

    // Validate format
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      setIssueErrors(prev => ({ 
        ...prev, 
        studentPhoto: 'File format not supported. Please use JPG, PNG, WebP, or PDF.' 
      }))
      return
    }

    // Max file size before compression: 10MB
    const maxBeforeCompression = 10 * 1024 * 1024
    if (file.size > maxBeforeCompression) {
      setIssueErrors(prev => ({ 
        ...prev, 
        studentPhoto: 'File is too large even after compression. Try a smaller file.' 
      }))
      return
    }

    setIsCompressing(true)
    setOriginalSizeKB(getFileSizeKB(file))
    setCompressedSizeKB(null)
    setCertType(null)
    setCertMimeType(null)
    setPdfFilename(null)
    setCompressedFileBlob(null)
    setStudentPhoto(null)
    setStudentPhotoPreview(null)

    try {
      const compressedBlob = await compressFile(file)
      const compressedSize = getFileSizeKB(compressedBlob)
      const type = file.type === 'application/pdf' ? 'pdf' : 'image'
      const maxAllowedCompressedSize = type === 'pdf' ? 3 * 1024 * 1024 : 2 * 1024 * 1024

      if (compressedBlob.size > maxAllowedCompressedSize) {
        setIssueErrors(prev => ({ 
          ...prev, 
          studentPhoto: 'File is too large even after compression. Try a smaller file.' 
        }))
        setIsCompressing(false)
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const base64Data = reader.result as string
        setStudentPhoto(base64Data)
        setStudentPhotoPreview(base64Data)
        setCompressedSizeKB(compressedSize)
        setCertType(type)
        setCertMimeType(file.type)
        setCompressedFileBlob(compressedBlob)
        if (type === 'pdf') {
          setPdfFilename(file.name)
        }
        setIsCompressing(false)
      }
      reader.onerror = () => {
        setIssueErrors(prev => ({ 
          ...prev, 
          studentPhoto: 'Failed to compress file. Please try another file.' 
        }))
        setIsCompressing(false)
      }
      reader.readAsDataURL(compressedBlob)
    } catch (error) {
      console.error('Compression error:', error)
      setIssueErrors(prev => ({ 
        ...prev, 
        studentPhoto: 'Failed to compress file. Please try another file.' 
      }))
      setIsCompressing(false)
    }
  }

  // Check unique Certificate ID
  const isCertificateIdUnique = async (certId: string): Promise<boolean> => {
    const targetId = certId.trim()
    if (!targetId) return true

    try {
      // 1. Fetch from pending_credentials
      const { data: pendingData, error: pendingErr } = await supabase
        .from('pending_credentials')
        .select('sdjwt')
      
      if (!pendingErr && pendingData) {
        for (const row of pendingData) {
          if (!row.sdjwt) continue
          // Check disclosures
          try {
            const disclosures = readDisclosures(row.sdjwt)
            const found = disclosures.find(d => (d.name === 'certificate_id' || d.name === 'certificateId') && String(d.value) === targetId)
            if (found) return false
          } catch {}

          // Check payload
          try {
            const payload = JSON.parse(atob(row.sdjwt.split('~')[0].split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
            if (payload.certificate_id === targetId || payload.certificateId === targetId) return false
          } catch {}
        }
      }

      // 2. Fetch from credentials (if claimed = false exists)
      const { data: credData, error: credErr } = await supabase
        .from('credentials')
        .select('sd_jwt')
        .eq('claimed', false)

      if (!credErr && credData) {
        for (const row of credData) {
          if (!row.sd_jwt) continue
          // Check disclosures
          try {
            const disclosures = readDisclosures(row.sd_jwt)
            const found = disclosures.find(d => (d.name === 'certificate_id' || d.name === 'certificateId') && String(d.value) === targetId)
            if (found) return false
          } catch {}

          // Check payload
          try {
            const payload = JSON.parse(atob(row.sd_jwt.split('~')[0].split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
            if (payload.certificate_id === targetId || payload.certificateId === targetId) return false
          } catch {}
        }
      }
    } catch (err) {
      console.error('Error checking certificate ID uniqueness:', err)
    }

    return true
  }

  // Handle Credential Issuance
  const handleIssueCredential = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!issuerInfo || !privateKey || !currentUser) return

    // Validate
    const nextErrors: Record<string, string> = {}
    if (!studentPhoto || isCompressing) {
      nextErrors.studentPhoto = 'Certificate upload is required and must be fully compressed.'
    }
    if (!studentEmail.trim() || !studentEmail.includes('@')) {
      nextErrors.studentEmail = 'A valid student email is required.'
    }
    if (!studentName.trim()) {
      nextErrors.studentName = 'Student name is required.'
    }
    if (!studentId.trim()) {
      nextErrors.studentId = 'Student ID is required.'
    }
    if (!degreeType) {
      nextErrors.degreeType = 'Degree type is required.'
    }
    if (!major.trim()) {
      nextErrors.major = 'Major/Field is required.'
    }
    if (!graduationDate) {
      nextErrors.graduationDate = 'Graduation date is required.'
    }
    
    // Certificate ID manual validation:
    // - Must be filled in: REQUIRED
    // - Must be unique: REQUIRED
    // - No spaces at start/end
    // - Alphanumeric + dots/hyphens allowed
    // - Min 3 chars, Max 20 chars
    const certIdTrimmed = certificateId.trim()
    if (!certificateId) {
      nextErrors.certificateId = 'Certificate ID is required.'
    } else if (certificateId !== certIdTrimmed) {
      nextErrors.certificateId = 'Certificate ID cannot contain leading or trailing spaces.'
    } else if (certificateId.length < 3 || certificateId.length > 20) {
      nextErrors.certificateId = 'Certificate ID must be between 3 and 20 characters.'
    } else if (!/^[a-zA-Z0-9.-]+$/.test(certificateId)) {
      nextErrors.certificateId = 'Certificate ID must contain only alphanumeric characters, dots, or hyphens.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setIssueErrors(nextErrors)
      return
    }

    setIssueErrors({})
    setIssueSubmitError(null)
    setIsSubmittingIssue(true)

    // Uniqueness check
    const isUnique = await isCertificateIdUnique(certificateId)
    if (!isUnique) {
      setIssueErrors(prev => ({ ...prev, certificateId: 'Certificate ID already used. Please choose another.' }))
      setIsSubmittingIssue(false)
      return
    }

    try {
      const fullDegreeTitle = `${degreeType} of ${major.trim()}`

      // 1. Setup Subject claims
      const claims: Record<string, any> = {
        sub: studentUserId ?? studentEmail.trim().toLowerCase(),
        student_id: studentId.trim(),
        email: studentEmail.trim().toLowerCase(),
        name: studentName.trim(),
        degree_type: degreeType,
        major: major.trim(),
        graduation_date: graduationDate,
        certificate_id: certificateId.trim(),
        photo: studentPhoto,
        institution: issuerInfo.name,
        iss: issuerInfo.did,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60 * 5),
        
        // Metadata fields
        student_certificate_original_size: originalSizeKB,
        student_certificate_compressed_size: compressedSizeKB,
        student_certificate_type: certType,
        student_certificate_mime_type: certMimeType
      }

      // 2. Issue SD-JWT
      const sdJwt = await issueSdJwt({
        issuerDid: issuerInfo.did,
        issuerPrivateJwk: privateKey,
        subject: claims,
        vct: 'https://actik.kh/credentials/degree',
        expiresInSec: 365 * 24 * 60 * 60 * 5
      })

      // 3. Save to database (trying user columns first, fallback to pending_credentials if PGRST204 / schema.sql matches)
      let res = await supabase.from('credentials').insert({
        issuer_id: currentUser.id,
        holder_id: studentUserId ?? null,
        holder_email: studentEmail.trim().toLowerCase(),
        issuer_did: issuerInfo.did,
        institution_name: issuerInfo.name,
        degree_title: fullDegreeTitle,
        sd_jwt: sdJwt,
        claimed: false,
        encrypted: false,
        is_encrypted: false,
        created_at: new Date().toISOString()
      })

      if (res.error && (res.error.message.includes('column') || res.error.code === '42703')) {
        res = await supabase.from('pending_credentials').insert({
          recipient_email: studentEmail.trim().toLowerCase(),
          sdjwt: sdJwt,
          issuer_did: issuerInfo.did,
          label: fullDegreeTitle
        })
      }

      if (res.error) throw res.error

      setIssuedSdJwt(sdJwt)
    } catch (err: any) {
      setIssueSubmitError(err.message || 'Credential issuance failed.')
    } finally {
      setIsSubmittingIssue(false)
    }
  }

  const handleResetIssueForm = () => {
    setStudentPhoto(null)
    setStudentPhotoPreview(null)
    setStudentEmail('')
    setStudentName('')
    setStudentId('')
    setDegreeType('Bachelor')
    setMajor('')
    setGraduationDate('')
    setCertificateId('')
    setIssuedSdJwt(null)
    setStudentFoundStatus(null)
    setStudentUserId(null)
    setIssueErrors({})
    setIssueSubmitError(null)
    setIsCompressing(false)
    setOriginalSizeKB(null)
    setCompressedSizeKB(null)
    setCertType(null)
    setCertMimeType(null)
    setPdfFilename(null)
    setCompressedFileBlob(null)
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
        <p className="text-gray-500 mt-4 font-semibold text-sm">Loading dashboard details...</p>
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
            <h1 className="text-2xl font-bold text-stone-900 mt-3">Register Institution</h1>
            <p className="text-sm text-stone-500 mt-1">
              Join the Cambodia trust registry. Once registered and approved by MoEYS, you can issue secure digital certificates.
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="text-xs md:text-sm font-bold text-stone-700 block mb-1">
                Institution name
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
                Domain name
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
                This domain builds your did:web identity (e.g. did:web:rupp.edu.kh) to verify your credentials.
              </p>
              {regErrors.domain && (
                <p className="text-red-600 text-xs mt-1 font-semibold">{regErrors.domain}</p>
              )}
            </div>

            <div>
              <label className="text-xs md:text-sm font-bold text-stone-700 block mb-1">
                Institution type
              </label>
              <select
                value={regType}
                onChange={(e) => setRegType(e.target.value)}
                className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
              >
                <option value="">Select type...</option>
                <option value="University">University</option>
                <option value="Ministry">Ministry</option>
                <option value="Training Centre">Training Centre</option>
                <option value="Other">Other</option>
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
              <span>Register institution</span>
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
              <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">Issuer Dashboard</h1>
              <p className="text-sm text-stone-500 mt-0.5">
                Manage your certificates and view institution settings.
              </p>
            </div>
          </div>

          {/* Institution Profile Card */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex flex-col gap-2.5">
              {/* Row 1: Title */}
              <div className="flex items-center gap-2">
                <span className="text-xl shrink-0">🏛️</span>
                <h2 className="text-base font-bold text-stone-900 tracking-tight leading-tight truncate">
                  {issuerInfo.name}
                </h2>
              </div>

              {/* Row 2: Status, Type, Domain */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-stone-500">
                {issuerInfo.accredited ? (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded uppercase tracking-wider text-[10px]">
                    ✓ Accredited
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded uppercase tracking-wider text-[10px]">
                    ⏳ Pending
                  </span>
                )}
                <span className="inline-flex items-center bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded text-[10px] font-medium font-sans">
                  {issuerInfo.type}
                </span>
                {issuerInfo.domain && (
                  <a
                    href={`https://${issuerInfo.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-indigo-600 transition-colors font-medium flex items-center gap-0.5 underline text-stone-500"
                  >
                    <span>{issuerInfo.domain}</span>
                    <span className="text-[10px]">↗</span>
                  </a>
                )}
              </div>

              {/* Row 3: DID */}
              <div className="border-t border-stone-200/60 pt-2.5">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
                  Decentralized Identifier (DID)
                </span>
                <code className="text-xs bg-white border border-stone-200/80 p-2 rounded block font-mono text-stone-600 break-all select-all leading-normal">
                  {issuerInfo.did}
                </code>
              </div>
            </div>
          </div>

          {/* If NOT Accredited: Warning Yellow Card */}
          {!issuerInfo.accredited ? (
            <div className="bg-amber-50 border-l-4 border-amber-500 rounded-xl p-6 md:p-8 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="text-3xl mt-0.5">⏳</div>
                <div>
                  <h2 className="text-lg font-bold text-amber-800">Awaiting MoEYS Approval</h2>
                  <p className="text-sm text-stone-600 mt-2 leading-relaxed">
                    Your institution registration request has been submitted to the registry. The Ministry of Education, Youth and Sport (MoEYS) will inspect and accredit your profile shortly.
                  </p>
                  <p className="text-xs text-stone-500 mt-3 font-medium italic">
                    Note: You will be allowed to issue digital credentials once your profile is marked accredited in the system.
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
                    <h2 className="text-lg font-bold text-amber-800">Cryptographic Signing Key Expired</h2>
                    <p className="text-sm text-stone-600 mt-2 leading-relaxed font-normal">
                      For compliance and wallet security, your private signing key is stored in this local browser session. Closing the tab, refreshing, or timing out clears the memory.
                    </p>
                    <p className="text-sm text-stone-600 mt-2 leading-relaxed font-semibold">
                      To begin issuing certificates, please re-generate your signing key and update the public registry.
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
                      <span>Re-generate & Update Keys</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* If accredited & key is active: Credential Issuance Panel */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                <div className="lg:col-span-7 bg-white rounded-2xl border border-stone-200 p-6 md:p-8 shadow-sm">
                  {issuedSdJwt ? (
                    // Token Issuance Success View
                    <div className="space-y-6 text-left">
                      <div className="text-center">
                        <span className="text-5xl">🎉</span>
                        <h2 className="text-xl font-bold text-stone-900 mt-2">Credential Issued!</h2>
                        <p className="text-sm text-emerald-600 font-semibold mt-1">
                          Certificate issued to {studentEmail}
                        </p>
                        <p className="text-xs text-stone-500 mt-1">
                          The certificate was generated and signed with your institution's DID document.
                        </p>
                      </div>

                      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-sm space-y-2.5">
                        <div>
                          <span className="text-xs text-stone-400 block font-bold">Recipient Email</span>
                          <strong className="text-stone-800">{studentEmail}</strong>
                        </div>
                        <div>
                          <span className="text-xs text-stone-400 block font-bold">Degree Certificate</span>
                          <strong className="text-stone-800">{degreeType} of {major}</strong>
                        </div>
                      </div>

                      <div className="bg-indigo-50 border border-indigo-150 rounded-lg p-4 text-xs text-indigo-800 leading-normal">
                        {studentFoundStatus === 'found' ? (
                          <span>This student account is active. They will see this certificate immediately in their wallet pending claim.</span>
                        ) : (
                          <span>This email address is not registered on Actik yet. The credential will be securely stored in the pending directory and will be claimed automatically when they register.</span>
                        )}
                      </div>

                      {/* Display SD-JWT in a code block */}
                      {/* Token is already stored in database and sent via email
                          Issuer doesn't need to manually copy it
                          Keeping it visible for reference only */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-stone-700">
                          SIGNED SD-JWT TOKEN
                        </label>
                        <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 overflow-auto max-h-32">
                          <code className="text-xs text-stone-600 font-mono break-all select-all">
                            {issuedSdJwt}
                          </code>
                        </div>
                      </div>

                      <button
                        onClick={handleResetIssueForm}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center cursor-pointer"
                      >
                        Issue Another Credential
                      </button>
                    </div>
                  ) : (
                    // Issuance Form
                    <form onSubmit={handleIssueCredential} className="space-y-6 text-left">
                      <h2 className="text-lg font-bold text-stone-900 border-b border-stone-100 pb-2 flex items-center gap-2">
                        <span>📋</span> Issue Credential Form
                      </h2>

                      {/* 1. CERTIFICATE FILE UPLOAD */}
                      <div className="space-y-4">
                        <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
                          Upload Certificate
                        </label>
                        
                        {!studentPhoto && !isCompressing ? (
                          <div className="flex flex-col items-start gap-2">
                            <label 
                              htmlFor="certificate-upload"
                              className="inline-flex items-center justify-center px-4 py-2 border border-stone-300 rounded-lg text-sm font-semibold text-stone-700 bg-white hover:bg-stone-50 active:bg-stone-100 cursor-pointer transition-colors shadow-sm"
                            >
                              Choose File
                            </label>
                            <input
                              id="certificate-upload"
                              type="file"
                              accept="image/png, image/jpeg, image/webp, application/pdf"
                              onChange={handleFileChange}
                              className="hidden"
                            />
                            <p className="text-[11px] text-stone-400">
                              JPG, PNG, WebP, or PDF. Max 10MB (will be compressed automatically)
                            </p>
                          </div>
                        ) : isCompressing ? (
                          <div className="flex items-center gap-3 py-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-stone-200 border-t-indigo-600" />
                            <span className="text-xs font-medium text-stone-500">Compressing...</span>
                          </div>
                        ) : (
                          <div className="border border-stone-200 rounded-xl p-4 bg-stone-50/50 space-y-3 max-w-md">
                            <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                              <span>✓</span> Certificate uploaded
                            </div>
                            
                            {certType === 'image' ? (
                              <div className="border border-stone-200 rounded p-1 bg-white inline-block max-w-[300px]">
                                <img 
                                  src={studentPhotoPreview!} 
                                  alt="Certificate Preview" 
                                  className="w-full h-auto max-w-[290px] rounded object-contain"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 p-2 border border-stone-200 rounded bg-white">
                                <span className="text-2xl">📄</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-stone-850 truncate">{pdfFilename}</p>
                                  <p className="text-[10px] text-stone-400">PDF Document - {compressedSizeKB ? (compressedSizeKB / 1024).toFixed(2) : 0}MB</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (compressedFileBlob) {
                                      const url = URL.createObjectURL(compressedFileBlob);
                                      window.open(url, '_blank');
                                    }
                                  }}
                                  className="text-xs text-indigo-650 hover:underline shrink-0 font-semibold px-2"
                                >
                                  Preview PDF
                                </button>
                              </div>
                            )}
                            
                            <div className="text-xs text-stone-500 flex items-center gap-1 font-medium">
                              <span>Size: Original {originalSizeKB ? (originalSizeKB / 1024).toFixed(1) : 0}MB</span>
                              <span>→</span>
                              <span className="font-semibold text-stone-800">Compressed {compressedSizeKB ? (compressedSizeKB / 1024).toFixed(1) : 0}MB</span>
                              <span className="text-emerald-600 font-bold">✓</span>
                            </div>
                            
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setStudentPhoto(null)
                                  setStudentPhotoPreview(null)
                                  setOriginalSizeKB(null)
                                  setCompressedSizeKB(null)
                                  setCertType(null)
                                  setCertMimeType(null)
                                  setPdfFilename(null)
                                  setCompressedFileBlob(null)
                                }}
                                className="px-3 py-1.5 border border-stone-300 rounded text-xs font-semibold text-stone-600 bg-white hover:bg-stone-50 transition-colors cursor-pointer"
                              >
                                Remove
                              </button>
                              <label
                                htmlFor="certificate-reupload"
                                className="px-3 py-1.5 border border-stone-300 rounded text-xs font-semibold text-stone-600 bg-white hover:bg-stone-50 transition-colors cursor-pointer"
                              >
                                Re-upload
                              </label>
                              <input
                                id="certificate-reupload"
                                type="file"
                                accept="image/png, image/jpeg, image/webp, application/pdf"
                                onChange={handleFileChange}
                                className="hidden"
                              />
                            </div>
                          </div>
                        )}
                        
                        {issueErrors.studentPhoto && (
                          <p className="text-red-600 text-xs font-semibold">{issueErrors.studentPhoto}</p>
                        )}
                      </div>

                      {/* 2. STUDENT INFORMATION */}
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1">
                          Student Information
                        </h3>

                        {/* Email */}
                        <div>
                          <label className="text-xs font-bold text-stone-700 block mb-1">
                            Email address
                          </label>
                          <div className="relative">
                            <input
                              type="email"
                              value={studentEmail}
                              onChange={(e) => setStudentEmail(e.target.value)}
                              onBlur={handleEmailBlur}
                              placeholder="student@example.com"
                              className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900 pr-10"
                            />
                            {checkingStudent && (
                              <div className="absolute right-3 top-3">
                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-stone-200 border-t-indigo-600" />
                              </div>
                            )}
                          </div>
                          {studentFoundStatus === 'found' && (
                            <p className="text-emerald-600 text-xs mt-1 font-semibold flex items-center gap-1 animate-fade-in">
                              <span>✓</span> Student account found in Actik profile registry
                            </p>
                          )}
                          {studentFoundStatus === 'not_found' && (
                            <p className="text-amber-600 text-xs mt-1 font-semibold flex items-center gap-1 leading-normal animate-fade-in">
                              <span>⚠</span> Profile not found. Credential will go to the pending queue until they sign up.
                            </p>
                          )}
                          {issueErrors.studentEmail && (
                            <p className="text-red-600 text-xs mt-1 font-semibold">{issueErrors.studentEmail}</p>
                          )}
                        </div>

                        {/* Student Name */}
                        <div>
                          <label className="text-xs font-bold text-stone-700 block mb-1">
                            Student Name
                          </label>
                          <input
                            type="text"
                            value={studentName}
                            onChange={(e) => setStudentName(e.target.value)}
                            placeholder="VA MOUNISEYHAK"
                            className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
                          />
                          {issueErrors.studentName && (
                            <p className="text-red-600 text-xs mt-1 font-semibold">{issueErrors.studentName}</p>
                          )}
                        </div>

                        {/* Student ID */}
                        <div>
                          <label className="text-xs font-bold text-stone-700 block mb-1">
                            Student ID
                          </label>
                          <input
                            type="text"
                            value={studentId}
                            onChange={(e) => setStudentId(e.target.value)}
                            placeholder="DE001"
                            className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
                          />
                          {issueErrors.studentId && (
                            <p className="text-red-600 text-xs mt-1 font-semibold">{issueErrors.studentId}</p>
                          )}
                        </div>
                      </div>

                      {/* 3. CREDENTIAL INFORMATION */}
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1">
                          Credential Information
                        </h3>

                        {/* Degree Type */}
                        <div>
                          <label className="text-xs font-bold text-stone-700 block mb-1">
                            Degree Type
                          </label>
                          <select
                            value={degreeType}
                            onChange={(e) => setDegreeType(e.target.value)}
                            className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
                          >
                            <option value="Bachelor">Bachelor</option>
                            <option value="Master">Master</option>
                            <option value="PhD">PhD</option>
                            <option value="Diploma">Diploma</option>
                            <option value="Certificate">Certificate</option>
                          </select>
                          {issueErrors.degreeType && (
                            <p className="text-red-600 text-xs mt-1 font-semibold">{issueErrors.degreeType}</p>
                          )}
                        </div>

                        {/* Major/Field */}
                        <div>
                          <label className="text-xs font-bold text-stone-700 block mb-1">
                            Major / Field of Study
                          </label>
                          <input
                            type="text"
                            value={major}
                            onChange={(e) => setMajor(e.target.value)}
                            placeholder="Digital Economy"
                            className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
                          />
                          {issueErrors.major && (
                            <p className="text-red-600 text-xs mt-1 font-semibold">{issueErrors.major}</p>
                          )}
                        </div>

                        {/* Graduation Date */}
                        <div>
                          <label className="text-xs font-bold text-stone-700 block mb-1">
                            Graduation Date
                          </label>
                          <input
                            type="date"
                            value={graduationDate}
                            onChange={(e) => setGraduationDate(e.target.value)}
                            className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
                          />
                          {issueErrors.graduationDate && (
                            <p className="text-red-600 text-xs mt-1 font-semibold">{issueErrors.graduationDate}</p>
                          )}
                        </div>

                        {/* Certificate ID */}
                        <div>
                          <label className="text-xs font-bold text-stone-700 block mb-1">
                            Certificate ID
                          </label>
                          <input
                            type="text"
                            value={certificateId}
                            onChange={(e) => setCertificateId(e.target.value)}
                            placeholder="e.g., DE.01, NUM.2023.001"
                            className="block w-full rounded-lg border border-stone-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900"
                          />
                          {issueErrors.certificateId && (
                            <p className="text-red-600 text-xs mt-1 font-semibold">{issueErrors.certificateId}</p>
                          )}
                        </div>

                        {/* Issuer DID */}
                        <div>
                          <label className="text-xs font-bold text-stone-400 block mb-1">
                            Issuer DID
                          </label>
                          <input
                            type="text"
                            value={issuerInfo.did}
                            readOnly
                            className="block w-full rounded-lg border border-stone-200 px-3 h-11 text-sm bg-stone-50 text-stone-500 cursor-not-allowed font-mono text-xs"
                          />
                        </div>
                      </div>

                      {issueSubmitError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 font-semibold">
                          {issueSubmitError}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isSubmittingIssue || checkingStudent}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold h-11 rounded-lg text-sm transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isSubmittingIssue && (
                          <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        )}
                        <span>Sign & Deliver Credential</span>
                      </button>
                    </form>
                  )}
                </div>

                {/* Preview column (hidden on mobile, centered on desktop) */}
                <div className="lg:col-span-5 space-y-3 hidden lg:block text-left animate-fade-in">
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block">
                    Credential Preview
                  </span>
                  
                  <div 
                    className="bg-white rounded-2xl border-2 border-dashed border-indigo-200 p-6 min-h-[360px] flex flex-col justify-between relative shadow-sm overflow-hidden"
                    style={{
                      backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(99,102,241,0.03) 0%, rgba(99,102,241,0) 80%)'
                    }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-base font-bold text-indigo-950 leading-snug">{issuerInfo.name}</h3>
                        <p className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">
                          Cambodia registry
                        </p>
                      </div>
                      <span className="bg-indigo-50 border border-indigo-150 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded shrink-0">
                        SD-JWT VC
                      </span>
                    </div>

                    <div className="my-4 flex items-start gap-4">
                      {studentPhotoPreview ? (
                        certType === 'pdf' ? (
                          <div className="w-16 h-20 bg-stone-50 border border-stone-200 rounded flex flex-col items-center justify-center shrink-0 text-stone-500 shadow-sm">
                            <span className="text-2xl">📄</span>
                            <span className="text-[8px] font-bold text-stone-400 mt-1 uppercase">PDF</span>
                          </div>
                        ) : (
                          <img 
                            src={studentPhotoPreview} 
                            alt="Student" 
                            className="w-16 h-20 object-cover border border-stone-200 rounded shadow-sm shrink-0" 
                          />
                        )
                      ) : (
                        <div className="w-16 h-20 bg-stone-50 border border-dashed border-stone-200 rounded flex items-center justify-center shrink-0 text-[10px] text-stone-400 text-center font-medium">
                          No Photo
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="mb-2">
                          <span className="text-[9px] text-stone-400 uppercase tracking-widest font-semibold block leading-none mb-0.5">
                            Student ID
                          </span>
                          <strong className="text-xs font-mono text-stone-800">
                            {studentId.trim() || '—'}
                          </strong>
                        </div>

                        <div>
                          <span className="text-[9px] text-stone-400 uppercase tracking-widest font-semibold block leading-none mb-0.5">
                            Student Name
                          </span>
                          <strong className="text-sm text-stone-900 block truncate">
                            {studentName.trim() || 'VA MOUNISEYHAK'}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="text-center my-4 border-t border-b border-stone-100 py-3">
                      <p className="text-[9px] text-stone-400 uppercase tracking-widest font-semibold mb-1">
                        has completed all requirements for
                      </p>
                      <h4 className="text-sm font-bold text-indigo-700 leading-tight font-sans">
                        {degreeType} of {major.trim() || 'Digital Economy'}
                      </h4>
                    </div>

                    <div className="flex justify-between items-end text-xs text-stone-500 font-medium pt-2">
                      <div>
                        <span className="text-[10px] text-stone-400 block font-semibold">Certificate ID</span>
                        <span className="text-xs font-mono text-indigo-700 bg-indigo-50/50 px-1 py-0.5 rounded inline-block">
                          {certificateId || 'DE.01'}
                        </span>
                      </div>
                      <div className="text-right">
                        <div>Date: <strong>{graduationDate ? new Date(graduationDate).toLocaleDateString() : '—'}</strong></div>
                      </div>
                    </div>

                    <div className="border-t border-stone-100 pt-3 mt-3">
                      <span className="text-[9px] text-stone-400 block font-semibold">Issuer DID</span>
                      <code className="text-[9px] font-mono text-indigo-650 bg-indigo-50/50 px-1 py-0.5 rounded block truncate">
                        {issuerInfo.did}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
