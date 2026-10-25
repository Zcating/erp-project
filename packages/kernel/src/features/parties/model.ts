export type Supplier = {
  id: string;
  code: string;
  name: string;
  contact: string | null;
};

export type SupplierInput = {
  code: string;
  name: string;
  contact: string | null;
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  contact: string | null;
};

export type CustomerInput = {
  code: string;
  name: string;
  contact: string | null;
};

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  purpose: string | null;
};

export type WarehouseInput = {
  code: string;
  name: string;
  purpose: string | null;
};
