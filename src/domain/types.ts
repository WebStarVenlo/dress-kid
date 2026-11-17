/** Shared domain types for Dress Kid. */
import { t } from '../i18n';
import type { AvatarId } from './avatars';


export type Category =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'sweater'
  | 'socks'
  | 'shoes'
  | 'jacket'
  | 'accessory';

/** Fixed order in which categories are shown. */
export const CATEGORIES: readonly Category[] = [
  'top',
  'bottom',
  'dress',
  'sweater',
  'socks',
  'shoes',
  'jacket',
  'accessory',
];

/** Translated at access time (getters), so a language switch is picked up. */
export const CATEGORY_LABELS: Record<Category, string> = {
  get top() { return t('common:categories.top'); },
  get bottom() { return t('common:categories.bottom'); },
  get dress() { return t('common:categories.dress'); },
  get sweater() { return t('common:categories.sweater'); },
  get socks() { return t('common:categories.socks'); },
  get shoes() { return t('common:categories.shoes'); },
  get jacket() { return t('common:categories.jacket'); },
  get accessory() { return t('common:categories.accessory'); },
};

export const CATEGORY_EMOJI: Record<Category, string> = {
  top: '👕',
  bottom: '👖',
  dress: '👗',
  sweater: '👚',
  socks: '🧦',
  shoes: '👟',
  jacket: '🧥',
  accessory: '🧢',
};

/** Season of an item; 'all' = all year round. */
export type ItemSeason = 'summer' | 'winter' | 'all';

/** The season the parent has currently set; 'all' = no season filter. */
export type CurrentSeason = 'summer' | 'winter' | 'all';

/** Translated at access time (getters), so a language switch is picked up. */
export const SEASON_LABELS: Record<ItemSeason, string> = {
  get summer() { return t('common:seasons.summer'); },
  get winter() { return t('common:seasons.winter'); },
  get all() { return t('common:seasons.all'); },
};

export interface ClothingItem {
  id: string;
  category: Category;
  /** Optional name, only visible to the parent. */
  name?: string;
  season: ItemSeason;
  /** False = temporarily unavailable (e.g. in the laundry). */
  available: boolean;
  /**
   * Ids of items that do NOT go with this one.
   * Exclusions are symmetric: the storage layer keeps track of both sides.
   */
  excludedIds: string[];
  /** Optional size (free text, e.g. "110" or "28"). Without a size it fits every child. */
  size?: string;
  /** Downscaled photo. */
  photo: Blob;
  createdAt: number;
}

export interface NewClothingItem {
  category: Category;
  name?: string;
  season: ItemSeason;
  size?: string;
  photo: Blob;
}

/** Sizes per category; a child can have several sizes per category. */
export type ChildSizes = Partial<Record<Category, string[]>>;

export interface Child {
  id: string;
  name: string;
  /** CSS colour (hex, e.g. "#ff8800") for the profile tile. */
  color: string;
  /** Optional animal figure as profile picture; without an avatar the UI shows e.g. the first letter. */
  avatar?: AvatarId;
  /** Stickers for this child; missing = on (old data and backups get stickers). */
  stickersEnabled?: boolean;
  sizes: ChildSizes;
  createdAt: number;
}

/** Are stickers on for this child? If the value is missing, yes. */
export function stickersOn(child: Pick<Child, 'stickersEnabled'>): boolean {
  return child.stickersEnabled !== false;
}

export interface NewChild {
  name: string;
  color: string;
  /** Optional animal figure; an unknown value is ignored. */
  avatar?: AvatarId;
  /** Optional; missing = on. A non-boolean is ignored. */
  stickersEnabled?: boolean;
  sizes: ChildSizes;
}

/** Hashed parent PIN (PBKDF2-SHA-256). Never included in a backup. */
export interface StoredPin {
  /** Base64-encoded salt. */
  salt: string;
  /** Base64-encoded derived key. */
  hash: string;
  iterations: number;
}

export interface Settings {
  currentSeason: CurrentSeason;
  /** "Sound and read-aloud" in child mode. On by default; old data and backups get `true`. */
  soundEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = { currentSeason: 'all', soundEnabled: true };

/** The child's choice: at most one item id per category. */
export type Outfit = Partial<Record<Category, string>>;

/** The outfit the child picked for a given day. */
export interface SavedOutfit {
  childId: string;
  /** Local date, format YYYY-MM-DD. */
  date: string;
  outfit: Outfit;
  /**
   * Moment (epoch ms) at which the child tapped "Done" that day: the sticker is then earned.
   * Missing if the day has not (yet) been completed. Stays if the outfit changes later.
   */
  completedAt?: number;
}
