import { createContext, useContext, useState, useCallback } from 'react';
import ro from './ro.json';
import en from './en.json';

const translations = { ro, en };

const I18nContext = createContext({
  lang: 'ro',
  t: () => '',
  setLang: () => {},
});

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const stored = localStorage.getItem('www2video_lang');
      return (stored === 'ro' || stored === 'en') ? stored : 'ro';
    } catch { return 'ro'; }
  });

  const switchLang = useCallback((l) => {
    setLang(l);
    try { localStorage.setItem('www2video_lang', l); } catch {}
  }, []);

  const t = useCallback((key) => {
    const keys = key.split('.');
    let val = translations[lang];
    for (const k of keys) {
      if (val && typeof val === 'object') val = val[k];
      else return key;
    }
    return val || key;
  }, [lang]);

  const toggleLang = useCallback(() => {
    switchLang(lang === 'ro' ? 'en' : 'ro');
  }, [lang, switchLang]);

  return (
    <I18nContext.Provider value={{ lang, t, setLang: switchLang, toggleLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
