/** Dierfiguren die een ouder per kind kan kiezen als profielplaatje. */
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

/** Nederlandse namen, alleen voor de ouder (bijv. als toegankelijke naam in de kiezer). */
export const AVATAR_LABELS: Record<AvatarId, string> = {
  fox: 'Vos',
  bunny: 'Konijn',
  bear: 'Beer',
  cat: 'Poes',
  dog: 'Hond',
  panda: 'Panda',
  frog: 'Kikker',
  owl: 'Uil',
  lion: 'Leeuw',
  unicorn: 'Eenhoorn',
  dino: 'Dino',
  penguin: 'Pinguïn',
}

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value)
}
