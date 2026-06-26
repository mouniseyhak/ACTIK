import { Globe } from 'lucide-react'
import { useLanguage } from '../lib/i18n'

interface LanguageSwitcherProps {
  prefix: 'settings' | 'account'
}

export default function LanguageSwitcher({ prefix }: LanguageSwitcherProps) {
  const { t, language, setLanguage } = useLanguage()

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2">
          <Globe size={18} className="text-indigo-500" />
          <span>{t(`${prefix}.language`)}</span>
        </h3>
      </div>
      
      <div className="flex items-center gap-4">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'en' | 'km')}
          className="block w-full max-w-xs rounded-lg border border-gray-300 px-3 h-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-stone-900 cursor-pointer"
        >
          <option value="en">EN / English</option>
          <option value="km">ខ្មែរ / Khmer</option>
        </select>
      </div>
      <p className="text-xs text-stone-500 mt-3 leading-relaxed">
        {t(`${prefix}.language_desc`)}
      </p>
    </div>
  )
}
