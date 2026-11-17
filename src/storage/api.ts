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
 * Contract of the storage layer (IndexedDB). The UI only uses this interface,
 * so another storage (e.g. sync) can be added later.
 */
export interface WardrobeStore {
  listItems(): Promise<ClothingItem[]>;
  getItem(id: string): Promise<ClothingItem | undefined>;
  addItem(input: NewClothingItem): Promise<ClothingItem>;
  /** Changes fields of an item (not the exclusions). */
  updateItem(
    id: string,
    changes: Partial<Pick<ClothingItem, 'category' | 'name' | 'season' | 'size' | 'available' | 'photo'>>,
  ): Promise<ClothingItem>;
  /** Deletes the item and all references to it in exclusions and outfits. */
  deleteItem(id: string): Promise<void>;
  /** Sets or removes an exclusion between two items, on both sides. */
  setExcluded(idA: string, idB: string, excluded: boolean): Promise<void>;

  /** Settings; missing fields (old data) get their default value. */
  getSettings(): Promise<Settings>;
  /**
   * Saves all settings (replaces them). Throws on an unknown season; an invalid
   * `soundEnabled` becomes the default value `true`.
   */
  saveSettings(settings: Settings): Promise<void>;

  listChildren(): Promise<Child[]>;
  /** Adds a child. An unknown `avatar` is ignored (child without avatar). */
  addChild(input: NewChild): Promise<Child>;
  /**
   * Changes fields of a child; fields not in `changes` stay unchanged.
   * Avatar: if the key `avatar` is in `changes` with value `undefined` (or `null`), the
   * avatar is removed; a valid id sets it; an unknown value is ignored (the existing
   * avatar stays).
   */
  updateChild(id: string, changes: Partial<NewChild>): Promise<Child>;
  /** Deletes the child and all of their stored outfits. */
  deleteChild(id: string): Promise<void>;

  getOutfit(childId: string, date: string): Promise<SavedOutfit | undefined>;
  /**
   * Saves the outfit of that day. A previously earned sticker (`completedAt`) is kept,
   * even if the child changes the outfit later. Throws if the child does not (or no longer) exist.
   */
  saveOutfit(childId: string, date: string, outfit: Outfit): Promise<void>;
  /**
   * Sticker book: marks the day as completed (the child tapped "Done"). Sets `completedAt` to now,
   * but only if that had not happened yet: the first time stays (idempotent). If there is
   * no outfit for that day yet, one is created with an empty outfit. Throws if the
   * child does not (or no longer) exist.
   * Returns `true` if `completedAt` was only just set (a new sticker), `false` if the day was already completed.
   */
  markOutfitCompleted(childId: string, date: string): Promise<boolean>;
  /** Sticker book: the number of completed days (outfits with `completedAt`) of this child; 0 for an unknown child. */
  countCompletedDays(childId: string): Promise<number>;

  /** Parent PIN; undefined = no PIN set. Not part of the backup. */
  getParentPin(): Promise<StoredPin | undefined>;
  /** Sets the PIN, or removes it with null. */
  setParentPin(pin: StoredPin | null): Promise<void>;

  /** Exports everything (including photos) as a single JSON file. */
  exportBackup(): Promise<Blob>;
  /** Replaces all data with the contents of a backup. Throws an Error for an invalid file. */
  importBackup(file: Blob): Promise<void>;
}
