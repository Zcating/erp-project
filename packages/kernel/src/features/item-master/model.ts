export const CONVERSION_RATE_SCALE = 6;

export type ItemAuxiliaryUnit = {
  unit: string;
  conversionRate: string;
};

export type ItemMaster = {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  specification: string | null;
  brand: string | null;
  category: string | null;
  baseUnit: string;
  auxiliaryUnits: ItemAuxiliaryUnit[];
};

export type ItemMasterInput = {
  code: string;
  barcode: string | null;
  name: string;
  specification: string | null;
  brand: string | null;
  category: string | null;
  baseUnit: string;
  auxiliaryUnits: ItemAuxiliaryUnit[];
};
