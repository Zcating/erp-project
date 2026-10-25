import type { TransactionContext } from "../../shared/transactions/index.js";
import type { ItemMaster } from "./model.js";

export type ItemMasterRepository = {
  list(context?: TransactionContext): Promise<ItemMaster[]>;
  findById(id: string, context?: TransactionContext): Promise<ItemMaster | null>;
  findByCode(code: string, context?: TransactionContext): Promise<ItemMaster | null>;
  findByBarcode(barcode: string, context?: TransactionContext): Promise<ItemMaster | null>;
  insert(item: ItemMaster, context?: TransactionContext): Promise<void>;
  update(item: ItemMaster, context?: TransactionContext): Promise<void>;
  remove(id: string, context?: TransactionContext): Promise<boolean>;
};
