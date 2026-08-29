'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Language, TranslationKey, translations } from '@/lib/i18n';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem('drawmoryLanguage');
      if (saved === 'fr') setLanguageState('fr');
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    document.documentElement.lang = next;
    window.localStorage.setItem('drawmoryLanguage', next);
  };

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage: () => setLanguage(language === 'en' ? 'fr' : 'en'),
      t: (key, values) => {
        let text: string = translations[language][key];
        for (const [name, replacement] of Object.entries(values ?? {})) {
          text = text.replace(`{${name}}`, String(replacement));
        }
        return text;
      },
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider.');
  return context;
}
