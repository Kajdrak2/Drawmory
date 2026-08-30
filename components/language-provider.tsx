'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  findSupportedLanguage,
  getLanguageOption,
  isLanguage,
  Language,
  TranslationKey,
  translations,
} from '@/lib/i18n';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem('drawmoryLanguage');
      const detected = isLanguage(saved) ? saved : findSupportedLanguage(window.navigator.languages);
      const option = getLanguageOption(detected);
      setLanguageState(detected);
      document.documentElement.lang = option.locale;
      document.documentElement.dir = option.direction;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setLanguage = (next: Language) => {
    const option = getLanguageOption(next);
    setLanguageState(next);
    document.documentElement.lang = option.locale;
    document.documentElement.dir = option.direction;
    window.localStorage.setItem('drawmoryLanguage', next);
  };

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, values) => {
        let text = translations[language]?.[key] ?? translations.en[key] ?? key;
        for (const [name, replacement] of Object.entries(values ?? {})) {
          text = text.split(`{${name}}`).join(String(replacement));
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
