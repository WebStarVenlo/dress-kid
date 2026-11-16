import type {
  ClothingItem,
  NewClothingItem,
  SavedOutfit,
  Settings,
  Outfit,
} from '../domain/types';

/**
 * Contract van de opslaglaag (IndexedDB). De UI gebruikt alleen deze interface,
 * zodat later een andere opslag (bijv. sync) kan worden toegevoegd.
 */
export interface WardrobeStore {
  listItems(): Promise<ClothingItem[]>;
  getItem(id: string): Promise<ClothingItem | undefined>;
  addItem(input: NewClothingItem): Promise<ClothingItem>;
  /** Wijzigt velden van een kledingstuk (niet de uitsluitingen). */
  updateItem(
    id: string,
    changes: Partial<Pick<ClothingItem, 'category' | 'name' | 'season' | 'available' | 'photo'>>,
  ): Promise<ClothingItem>;
  /** Verwijdert het kledingstuk en alle verwijzingen ernaar in uitsluitingen en outfits. */
  deleteItem(id: string): Promise<void>;
  /** Zet of verwijdert een uitsluiting tussen twee kledingstukken, aan beide kanten. */
  setExcluded(idA: string, idB: string, excluded: boolean): Promise<void>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  getOutfit(date: string): Promise<SavedOutfit | undefined>;
  saveOutfit(date: string, outfit: Outfit): Promise<void>;

  /** Exporteert alles (incl. foto's) als één JSON-bestand. */
  exportBackup(): Promise<Blob>;
  /** Vervangt alle data door de inhoud van een back-up. Gooit een Error bij een ongeldig bestand. */
  importBackup(file: Blob): Promise<void>;
}
