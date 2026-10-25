import { customType } from "drizzle-orm/pg-core";

export type DecimalText = { data: string; driverData: string };

export const quantityType = customType<DecimalText>({
  dataType: () => "erp.quantity",
});

export const unitPriceType = customType<DecimalText>({
  dataType: () => "erp.unit_price",
});

export const amountType = customType<DecimalText>({
  dataType: () => "erp.amount",
});
