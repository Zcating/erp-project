import type { TransactionContext } from "../../shared/transactions";
import type { ItemMaster } from "./model";

export type ItemMasterRepository = {
  list(context?: TransactionContext): Promise<ItemMaster[]>;
  findById(id: string, context?: TransactionContext): Promise<ItemMaster | null>;
  findByCode(code: string, context?: TransactionContext): Promise<ItemMaster | null>;
  findByBarcode(barcode: string, context?: TransactionContext): Promise<ItemMaster | null>;
  insert(item: ItemMaster, context?: TransactionContext): Promise<void>;
  update(item: ItemMaster, context?: TransactionContext): Promise<void>;
  remove(id: string, context?: TransactionContext): Promise<boolean>;
};
