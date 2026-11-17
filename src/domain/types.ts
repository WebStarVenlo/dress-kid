/** Gedeelde domeintypes voor Dress Kid. */
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

/** Vaste volgorde waarin categorieën getoond worden. */
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

export const CATEGORY_LABELS: Record<Category, string> = {
  top: 'Shirt',
  bottom: 'Broek of rok',
  dress: 'Jurk',
  sweater: 'Trui of vest',
  socks: 'Sokken',
  shoes: 'Schoenen',
  jacket: 'Jas',
  accessory: 'Extraatje',
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

/** Seizoen van een kledingstuk; 'all' = het hele jaar door. */
export type ItemSeason = 'summer' | 'winter' | 'all';

/** Het seizoen dat de ouder nu heeft ingesteld; 'all' = geen seizoensfilter. */
export type CurrentSeason = 'summer' | 'winter' | 'all';

export const SEASON_LABELS: Record<ItemSeason, string> = {
  summer: 'Zomer',
  winter: 'Winter',
  all: 'Altijd',
};

export interface ClothingItem {
  id: string;
  category: Category;
  /** Optionele naam, alleen zichtbaar voor de ouder. */
  name?: string;
  season: ItemSeason;
  /** False = tijdelijk niet beschikbaar (bijv. in de was). */
  available: boolean;
  /**
   * Id's van kledingstukken die hier NIET bij passen.
   * Uitsluitingen zijn symmetrisch: de opslaglaag houdt beide kanten bij.
   */
  excludedIds: string[];
  /** Optionele maat (vrije tekst, bijv. "110" of "28"). Zonder maat past het bij ieder kind. */
  size?: string;
  /** Verkleinde foto. */
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

/** Maten per categorie; een kind kan per categorie meerdere maten hebben. */
export type ChildSizes = Partial<Record<Category, string[]>>;

export interface Child {
  id: string;
  name: string;
  /** CSS-kleur (hex, bijv. "#ff8800") voor de profieltegel. */
  color: string;
  /** Optioneel dierfiguur als profielplaatje; zonder avatar toont de UI bijv. de eerste letter. */
  avatar?: AvatarId;
  sizes: ChildSizes;
  createdAt: number;
}

export interface NewChild {
  name: string;
  color: string;
  /** Optioneel dierfiguur; een onbekende waarde wordt genegeerd. */
  avatar?: AvatarId;
  sizes: ChildSizes;
}

/** Gehashte ouder-PIN (PBKDF2-SHA-256). Wordt nooit in een back-up meegenomen. */
export interface StoredPin {
  /** Base64-gecodeerde salt. */
  salt: string;
  /** Base64-gecodeerde afgeleide sleutel. */
  hash: string;
  iterations: number;
}

export interface Settings {
  currentSeason: CurrentSeason;
  /** "Geluid en voorlezen" in de kindmodus. Standaard aan; oude data en back-ups krijgen `true`. */
  soundEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = { currentSeason: 'all', soundEnabled: true };

/** De keuze van het kind: maximaal één kledingstuk-id per categorie. */
export type Outfit = Partial<Record<Category, string>>;

/** De outfit die het kind voor een bepaalde dag heeft gekozen. */
export interface SavedOutfit {
  childId: string;
  /** Lokale datum, formaat YYYY-MM-DD. */
  date: string;
  outfit: Outfit;
  /**
   * Moment (epoch ms) waarop het kind die dag op "Klaar" tikte: dan is de sticker verdiend.
   * Ontbreekt als de dag (nog) niet is afgerond. Blijft staan als de outfit later wijzigt.
   */
  completedAt?: number;
}
