import { useState } from 'react'
import { logRegistryExport } from '../../lib/auditLog'

interface RegistryExportModalProps {
  onClose: () => void
  totalInstitutions: number
  accreditedInstitutions: number
}

export default function RegistryExportModal({ onClose, totalInstitutions, accreditedInstitutions }: RegistryExportModalProps) {
  const [format, setFormat] = useState('JSON')
  const [includeSignatures, setIncludeSignatures] = useState(true)
  const [includeMetadata, setIncludeMetadata] = useState(true)
  const [includeAudit, setIncludeAudit] = useState(false)
  const [encrypt, setEncrypt] = useState(false)
  const [password, setPassword] = useState('')
  const [filter, setFilter] = useState('all')

  const handleDownload = async () => {
    let content = ''
    const mimeType = format === 'JSON' ? 'application/json' : format === 'CSV' ? 'text/csv' : format === 'XML' ? 'application/xml' : 'application/pdf'
    
    if (format === 'JSON') {
      content = JSON.stringify({
        registry: {
          version: "1.0",
          publishedBy: "did:web:moeys.gov.kh",
          publishedAt: new Date().toISOString(),
          metadataIncluded: includeMetadata,
          signaturesIncluded: includeSignatures,
          auditIncluded: includeAudit,
          institutions: [] // In real app, map real data here based on filter
        }
      }, null, 2)
    } else if (format === 'CSV') {
      content = `Name,DID,Domain,Type,Status,Accredited Date\nNational University of Management,did:web:num.edu.kh,num.edu.kh,University,Accredited,2023-12-11`
    } else if (format === 'XML') {
      content = `<?xml version="1.0"?>
<registry>
  <metadata>
    <publishedBy>did:web:moeys.gov.kh</publishedBy>
    <publishedAt>${new Date().toISOString()}</publishedAt>
  </metadata>
  <institutions></institutions>
</registry>`
    } else if (format === 'PDF') {
      // Stub for PDF generation
      alert('Generating official PDF report... (requires backend or PDFKit)')
      return
    }

    if (encrypt) {
      if (!password) {
        alert('Please enter a password for encryption.')
        return
      }
      alert('Encrypting file with AES-256... (stub)')
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `registry-${new Date().toISOString().split('T')[0]}.${format.toLowerCase()}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    try {
      await logRegistryExport(format)
    } catch (error) {
      console.error('Failed to log export:', error)
    }
    
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900 tracking-tight flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Trust Registry
          </h2>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Format Selection */}
          <div>
            <h3 className="text-sm font-bold text-stone-800 mb-3 uppercase tracking-wider">Choose export format:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: 'JSON', title: 'JSON', desc: 'Machine-readable format for verification', size: '2.5 KB' },
                { id: 'CSV', title: 'CSV (Spreadsheet)', desc: 'Human-readable spreadsheet format', size: '1.2 KB' },
                { id: 'PDF', title: 'PDF Report', desc: 'Official government report', size: '45 KB' },
                { id: 'XML', title: 'XML', desc: 'Structured format for integrations', size: '3.1 KB' }
              ].map(opt => (
                <label key={opt.id} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${format === opt.id ? 'border-indigo-500 bg-indigo-50' : 'border-stone-200 hover:border-indigo-300'}`}>
                  <input 
                    type="radio" 
                    name="format" 
                    value={opt.id} 
                    checked={format === opt.id} 
                    onChange={(e) => setFormat(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className={`font-bold text-sm ${format === opt.id ? 'text-indigo-900' : 'text-stone-800'}`}>{opt.title}</p>
                    <p className={`text-xs mt-0.5 ${format === opt.id ? 'text-indigo-700' : 'text-stone-500'}`}>{opt.desc}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[10px] font-mono text-stone-400">File size: ~{opt.size}</span>
                      <button type="button" className="text-[10px] font-bold text-indigo-600 hover:underline">
                        [Preview]
                      </button>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Options Selection */}
            <div>
              <h3 className="text-sm font-bold text-stone-800 mb-3 uppercase tracking-wider">Options:</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-700 font-medium">
                  <input type="checkbox" checked={includeSignatures} onChange={(e) => setIncludeSignatures(e.target.checked)} className="rounded text-indigo-600" />
                  Include digital signatures
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-700 font-medium">
                  <input type="checkbox" checked={includeMetadata} onChange={(e) => setIncludeMetadata(e.target.checked)} className="rounded text-indigo-600" />
                  Include metadata
                </label>
                <label className={`flex items-center gap-2 cursor-pointer text-sm font-medium ${format === 'JSON' ? 'text-stone-700' : 'text-stone-400'}`}>
                  <input type="checkbox" checked={includeAudit} onChange={(e) => setIncludeAudit(e.target.checked)} disabled={format !== 'JSON'} className="rounded text-indigo-600 disabled:opacity-50" />
                  Include audit trail (JSON only)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-700 font-medium">
                  <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} className="rounded text-indigo-600" />
                  Encrypt with password
                </label>
                {encrypt && (
                  <input 
                    type="password" 
                    placeholder="Enter password..." 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                )}
              </div>
            </div>

            {/* Filter Selection */}
            <div>
              <h3 className="text-sm font-bold text-stone-800 mb-3 uppercase tracking-wider">Institutions to export:</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-700 font-medium">
                  <input type="radio" name="filter" value="all" checked={filter === 'all'} onChange={(e) => setFilter(e.target.value)} className="text-indigo-600" />
                  All institutions ({totalInstitutions})
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-700 font-medium">
                  <input type="radio" name="filter" value="accredited" checked={filter === 'accredited'} onChange={(e) => setFilter(e.target.value)} className="text-indigo-600" />
                  Accredited only ({accreditedInstitutions})
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-400 font-medium">
                  <input type="radio" name="filter" value="selected" disabled className="text-indigo-600" />
                  Current selection (0 selected)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-white border border-stone-300 text-stone-700 text-sm font-bold rounded-lg shadow-sm hover:bg-stone-100 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleDownload}
            className="px-6 py-2 bg-indigo-600 border border-transparent text-white text-sm font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  )
}
