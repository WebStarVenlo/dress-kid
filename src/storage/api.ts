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

  /** Instellingen; ontbrekende velden (oude data) krijgen hun standaardwaarde. */
  getSettings(): Promise<Settings>;
  /**
   * Slaat alle instellingen op (vervangt ze). Gooit bij een onbekend seizoen; een ongeldige
   * `soundEnabled` wordt de standaardwaarde `true`.
   */
  saveSettings(settings: Settings): Promise<void>;

  listChildren(): Promise<Child[]>;
  /** Voegt een kind toe. Een onbekende `avatar` wordt genegeerd (kind zonder avatar). */
  addChild(input: NewChild): Promise<Child>;
  /**
   * Wijzigt velden van een kind; velden die niet in `changes` staan blijven ongewijzigd.
   * Avatar: staat de sleutel `avatar` in `changes` met waarde `undefined` (of `null`), dan wordt de
   * avatar verwijderd; een geldige id zet hem; een onbekende waarde wordt genegeerd (de bestaande
   * avatar blijft staan).
   */
  updateChild(id: string, changes: Partial<NewChild>): Promise<Child>;
  /** Verwijdert het kind en al zijn opgeslagen outfits. */
  deleteChild(id: string): Promise<void>;

  getOutfit(childId: string, date: string): Promise<SavedOutfit | undefined>;
  /**
   * Slaat de outfit van die dag op. Een eerder verdiende sticker (`completedAt`) blijft behouden,
   * ook als het kind de outfit later nog verandert. Gooit als het kind niet (meer) bestaat.
   */
  saveOutfit(childId: string, date: string, outfit: Outfit): Promise<void>;
  /**
   * Stickerboek: markeert de dag als afgerond (het kind tikte op "Klaar"). Zet `completedAt` op nu,
   * maar alleen als dat nog niet gebeurd was: de eerste tijd blijft staan (idempotent). Bestaat er
   * voor die dag nog geen outfit, dan wordt er een met een lege outfit aangemaakt. Gooit als het
   * kind niet (meer) bestaat.
   */
  markOutfitCompleted(childId: string, date: string): Promise<void>;
  /** Stickerboek: het aantal afgeronde dagen (outfits met `completedAt`) van dit kind; 0 bij een onbekend kind. */
  countCompletedDays(childId: string): Promise<number>;

  /** Ouder-PIN; undefined = geen PIN ingesteld. Valt buiten de back-up. */
  getParentPin(): Promise<StoredPin | undefined>;
  /** Zet de PIN, of verwijdert hem met null. */
  setParentPin(pin: StoredPin | null): Promise<void>;

  /** Exporteert alles (incl. foto's) als één JSON-bestand. */
  exportBackup(): Promise<Blob>;
  /** Vervangt alle data door de inhoud van een back-up. Gooit een Error bij een ongeldig bestand. */
  importBackup(file: Blob): Promise<void>;
}
