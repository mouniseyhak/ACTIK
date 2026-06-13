import { useState } from 'react'

export default function VerifyRegistry() {
  const [jsonInput, setJsonInput] = useState('')
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid' | 'error'>('idle')
  const [registryData, setRegistryData] = useState<any>(null)

  const handleVerify = () => {
    if (!jsonInput.trim()) return

    setVerifyStatus('loading')
    
    // Simulate verification delay
    setTimeout(() => {
      try {
        const parsed = JSON.parse(jsonInput)
        
        // Mock verification logic
        if (parsed?.registry?.signature || parsed?.signature) {
          setRegistryData(parsed.registry || parsed)
          setVerifyStatus('valid')
        } else {
          setVerifyStatus('invalid')
        }
      } catch (e) {
        setVerifyStatus('error')
      }
    }, 1500)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      setJsonInput(event.target?.result as string)
      setVerifyStatus('idle')
      setRegistryData(null)
    }
    reader.readAsText(file)
  }

  const handleDownloadStub = () => {
    alert("Downloading official registry... (Stub)")
  }

  const handleKeyDownloadStub = () => {
    alert("Downloading MoEYS public key... (Stub)")
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      
      {/* Public Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🏛️</div>
            <div>
              <h1 className="text-xl font-bold text-indigo-900 leading-tight">Actik Trust Registry</h1>
              <p className="text-xs text-stone-500 font-medium uppercase tracking-widest">Public Verification Portal</p>
            </div>
          </div>
          <a href="/" className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
            Return Home
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        
        <div className="bg-indigo-900 text-white p-6 md:p-8 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2 className="text-2xl font-extrabold mb-2 relative z-10">Verify Trust Registry Authenticity</h2>
          <p className="text-indigo-200 max-w-xl relative z-10">
            Use this tool to verify the Cambodia Digital Credentials Registry is authentic and signed by the Ministry of Education, Youth and Sport (MoEYS).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Verification Input Box */}
          <section className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm flex flex-col">
            <h3 className="text-sm font-bold text-stone-800 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span>🔐</span> Verify Registry
            </h3>
            
            <div className="space-y-4 flex-1 flex flex-col">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Upload registry file:</label>
                <div className="border-2 border-dashed border-stone-300 rounded-lg p-4 text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors cursor-pointer relative">
                  <input 
                    type="file" 
                    accept=".json" 
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="text-sm text-stone-500">
                    <span className="font-bold text-indigo-600">Choose File</span> or drag and drop
                  </div>
                  <div className="text-xs text-stone-400 mt-1">.json files only</div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <hr className="flex-1 border-stone-200" />
                <span className="text-xs font-bold text-stone-400 uppercase">OR PASTE</span>
                <hr className="flex-1 border-stone-200" />
              </div>

              <div className="flex-1 flex flex-col">
                <textarea 
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder="Paste registry JSON data here..."
                  className="flex-1 w-full min-h-[150px] p-3 text-xs font-mono border border-stone-200 rounded-lg bg-stone-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                />
              </div>

              <button 
                onClick={handleVerify}
                disabled={!jsonInput.trim() || verifyStatus === 'loading'}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
              >
                {verifyStatus === 'loading' ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying...
                  </>
                ) : 'Verify Signature'}
              </button>
            </div>
          </section>

          {/* Verification Results Box */}
          <section className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-stone-800 uppercase tracking-widest mb-4">
              Verification Results
            </h3>
            
            {verifyStatus === 'idle' && (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-stone-400 text-center">
                <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-sm font-medium">Awaiting registry file to verify.</p>
              </div>
            )}

            {verifyStatus === 'error' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
                <h4 className="font-bold flex items-center gap-2 mb-1">
                  <span>⚠️</span> VERIFICATION FAILED
                </h4>
                <p className="text-sm">Could not parse the provided data. Please ensure it is a valid JSON registry file and try again.</p>
              </div>
            )}

            {verifyStatus === 'invalid' && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800">
                <h4 className="font-bold flex items-center gap-2 mb-1">
                  <span>❌</span> SIGNATURE INVALID
                </h4>
                <p className="text-sm font-medium mb-2">Registry may be tampered with or is not signed by MoEYS.</p>
                <p className="text-xs font-bold text-rose-600 bg-white p-2 rounded border border-rose-100">Do not trust this registry file.</p>
              </div>
            )}

            {verifyStatus === 'valid' && registryData && (
              <div className="space-y-6 animate-scale-in">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
                  <h4 className="font-bold flex items-center gap-2 mb-1">
                    <span>✅</span> SIGNATURE VALID
                  </h4>
                  <p className="text-sm font-medium">Registry is authentic, signed by MoEYS, and has not been tampered with.</p>
                </div>

                <div>
                  <h5 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 border-b border-stone-100 pb-1">Registry Information</h5>
                  <ul className="text-sm space-y-1 text-stone-600">
                    <li className="flex justify-between">
                      <span className="font-medium">Published by:</span> 
                      <span className="font-mono text-xs bg-stone-100 px-1 rounded">{registryData.publishedBy || 'did:web:moeys.gov.kh'}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="font-medium">Published at:</span> 
                      <span className="font-semibold text-stone-800">{new Date(registryData.publishedAt || Date.now()).toLocaleString()}</span>
                    </li>
                    <li className="flex justify-between items-center">
                      <span className="font-medium">Signature:</span> 
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs text-stone-400">0x{(registryData.signature || '').substring(0, 8)}...</span>
                        <button className="text-[10px] font-bold text-indigo-600 hover:underline">[View Full]</button>
                      </div>
                    </li>
                    <li className="flex justify-between mt-2 pt-2 border-t border-stone-50">
                      <span className="font-medium">Total institutions:</span> 
                      <span className="font-bold text-stone-900">{registryData.institutions?.length || 0}</span>
                    </li>
                  </ul>
                  <div className="mt-3 text-xs bg-stone-50 p-2 rounded flex justify-between items-center">
                    <span className="font-medium text-stone-500">MoEYS Public Key:</span>
                    <div className="space-x-2">
                      <button className="font-bold text-indigo-600 hover:underline" onClick={handleKeyDownloadStub}>[Download]</button>
                    </div>
                  </div>
                </div>

                {registryData.institutions && registryData.institutions.length > 0 && (
                  <div>
                    <h5 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 border-b border-stone-100 pb-1">Institutions in Registry</h5>
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {registryData.institutions.map((inst: any, idx: number) => (
                        <div key={idx} className="bg-stone-50 p-3 rounded-lg border border-stone-100 text-sm">
                          <div className="font-bold text-stone-900 flex items-center gap-1.5 mb-1">
                            {inst.status === 'accredited' ? '✅' : '⏳'} {inst.name} <span className="font-normal text-xs text-stone-500">({inst.domain})</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="font-bold text-stone-500 uppercase">{inst.status}</span>
                            <span className="font-mono text-stone-400">{inst.did}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <button onClick={handleDownloadStub} className="flex-1 py-2 bg-stone-900 text-white text-sm font-bold rounded-lg hover:bg-stone-800 transition-colors">
                    Download Official Registry
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* How to verify guide */}
        <section className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-stone-800 uppercase tracking-widest mb-4 border-b border-stone-100 pb-2 flex items-center gap-2">
            <span>📚</span> How to Verify
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="font-bold text-stone-900 mb-2">Using this portal:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-stone-600 font-medium">
                <li>Get the registry from: <a href="https://registry.actik.kh" className="text-indigo-600 hover:underline">https://registry.actik.kh</a></li>
                <li>Upload or paste it into the form above</li>
                <li>Click <strong>[Verify Signature]</strong></li>
                <li>See the results immediately</li>
              </ol>
            </div>
            
            <div>
              <h4 className="font-bold text-stone-900 mb-2 flex justify-between items-center">
                <span>To verify manually via CLI:</span>
                <button className="text-xs text-indigo-600 font-bold hover:underline">[View Commands]</button>
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-stone-600 font-medium mb-3">
                <li>Download MoEYS public key from official site</li>
                <li>Verify registry signature with openssl</li>
              </ol>
              <div className="bg-stone-900 p-3 rounded-lg overflow-x-auto">
                <pre className="text-xs text-emerald-400 font-mono">
                  {`# For Linux/Mac:
openssl dgst -sha256 -verify moeys-public-key.pem \\
  -signature registry.sig registry.json`}
                </pre>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}
