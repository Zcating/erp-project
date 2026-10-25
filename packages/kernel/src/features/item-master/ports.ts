import type { ItemMaster } from "./model.js";

export type ItemMasterRepository = {
  list(): Promise<ItemMaster[]>;
  findById(id: string): Promise<ItemMaster | null>;
  findByCode(code: string): Promise<ItemMaster | null>;
  findByBarcode(barcode: string): Promise<ItemMaster | null>;
  insert(item: ItemMaster): Promise<void>;
  update(item: ItemMaster): Promise<void>;
  remove(id: string): Promise<boolean>;
};
