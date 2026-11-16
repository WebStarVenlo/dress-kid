import type {
  Child,
  ClothingItem,
  NewChild,
  StoredPin,
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
    changes: Partial<Pick<ClothingItem, 'category' | 'name' | 'season' | 'size' | 'available' | 'photo'>>,
  ): Promise<ClothingItem>;
  /** Verwijdert het kledingstuk en alle verwijzingen ernaar in uitsluitingen en outfits. */
  deleteItem(id: string): Promise<void>;
  /** Zet of verwijdert een uitsluiting tussen twee kledingstukken, aan beide kanten. */
  setExcluded(idA: string, idB: string, excluded: boolean): Promise<void>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  listChildren(): Promise<Child[]>;
  addChild(input: NewChild): Promise<Child>;
  updateChild(id: string, changes: Partial<NewChild>): Promise<Child>;
  /** Verwijdert het kind en al zijn opgeslagen outfits. */
  deleteChild(id: string): Promise<void>;

  getOutfit(childId: string, date: string): Promise<SavedOutfit | undefined>;
  saveOutfit(childId: string, date: string, outfit: Outfit): Promise<void>;

  /** Ouder-PIN; undefined = geen PIN ingesteld. Valt buiten de back-up. */
  getParentPin(): Promise<StoredPin | undefined>;
  /** Zet de PIN, of verwijdert hem met null. */
  setParentPin(pin: StoredPin | null): Promise<void>;

  /** Exporteert alles (incl. foto's) als één JSON-bestand. */
  exportBackup(): Promise<Blob>;
  /** Vervangt alle data door de inhoud van een back-up. Gooit een Error bij een ongeldig bestand. */
  importBackup(file: Blob): Promise<void>;
}
