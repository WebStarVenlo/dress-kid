import nlCommon from './locales/nl/common.json'
import nlKid from './locales/nl/kid.json'
import nlParent from './locales/nl/parent.json'
import nlSettings from './locales/nl/settings.json'
import nlErrors from './locales/nl/errors.json'

export const DEFAULT_LANGUAGE = 'nl'
export const defaultNS = 'common'

export const resources = {
  nl: {
    common: nlCommon,
    kid: nlKid,
    parent: nlParent,
    settings: nlSettings,
    errors: nlErrors,
  },
} as const
