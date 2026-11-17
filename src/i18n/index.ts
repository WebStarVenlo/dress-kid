import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources, defaultNS, DEFAULT_LANGUAGE } from './resources'

/**
 * Initialises i18next once. Dutch is the only (and default) language for now;
 * adding a language means adding `locales/<lng>/*.json` and registering it in
 * `resources.ts`.
 */
void i18next.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS,
  ns: Object.keys(resources[DEFAULT_LANGUAGE]),
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
  initAsync: false,
})

export default i18next
export const t = i18next.t.bind(i18next)
