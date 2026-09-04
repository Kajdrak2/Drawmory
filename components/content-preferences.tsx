'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

type ContentPreferencesValue = {
  showNsfw: boolean;
  preferencesReady: boolean;
  setShowNsfw: (show: boolean) => void;
};

const ContentPreferencesContext = createContext<ContentPreferencesValue | null>(null);
const STORAGE_KEY = 'drawmoryShowNsfw';

export function ContentPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [showNsfw, setShowNsfwState] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const changedByUser = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!changedByUser.current) {
        setShowNsfwState(window.localStorage.getItem(STORAGE_KEY) === '1');
      }
      setPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const value = useMemo<ContentPreferencesValue>(() => ({
    showNsfw,
    preferencesReady,
    setShowNsfw: (show) => {
      changedByUser.current = true;
      setShowNsfwState(show);
      window.localStorage.setItem(STORAGE_KEY, show ? '1' : '0');
    },
  }), [preferencesReady, showNsfw]);

  return (
    <ContentPreferencesContext.Provider value={value}>
      {children}
    </ContentPreferencesContext.Provider>
  );
}

export function useContentPreferences() {
  const context = useContext(ContentPreferencesContext);
  if (!context) {
    throw new Error('useContentPreferences must be used within ContentPreferencesProvider.');
  }
  return context;
}
