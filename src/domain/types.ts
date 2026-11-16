/** Gedeelde domeintypes voor Dress Kid. */

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
  /** Verkleinde foto. */
  photo: Blob;
  createdAt: number;
}

export interface NewClothingItem {
  category: Category;
  name?: string;
  season: ItemSeason;
  photo: Blob;
}

export interface Settings {
  currentSeason: CurrentSeason;
}

export const DEFAULT_SETTINGS: Settings = { currentSeason: 'all' };

/** De keuze van het kind: maximaal één kledingstuk-id per categorie. */
export type Outfit = Partial<Record<Category, string>>;

/** De outfit die het kind voor een bepaalde dag heeft gekozen. */
export interface SavedOutfit {
  /** Lokale datum, formaat YYYY-MM-DD. */
  date: string;
  outfit: Outfit;
}
