import { t } from '../i18n'

/** Animal figures a parent can choose per child as profile picture. */
export const AVATAR_IDS = [
  'fox',
  'bunny',
  'bear',
  'cat',
  'dog',
  'panda',
  'frog',
  'owl',
  'lion',
  'unicorn',
  'dino',
  'penguin',
] as const

export type AvatarId = (typeof AVATAR_IDS)[number]

/** Translated names, only for the parent (e.g. as accessible name in the picker). Translated at access time. */
export const AVATAR_LABELS: Record<AvatarId, string> = {
  get fox() { return t('common:avatars.fox') },
  get bunny() { return t('common:avatars.bunny') },
  get bear() { return t('common:avatars.bear') },
  get cat() { return t('common:avatars.cat') },
  get dog() { return t('common:avatars.dog') },
  get panda() { return t('common:avatars.panda') },
  get frog() { return t('common:avatars.frog') },
  get owl() { return t('common:avatars.owl') },
  get lion() { return t('common:avatars.lion') },
  get unicorn() { return t('common:avatars.unicorn') },
  get dino() { return t('common:avatars.dino') },
  get penguin() { return t('common:avatars.penguin') },
}

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value)
}
