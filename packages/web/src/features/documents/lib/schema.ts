import { z } from "zod";
import type { DraftDocumentType } from "./api";

export const documentLineDraftSchema = z.object({
  itemId: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  unit: z.string(),
  originalLineId: z.string(),
});

export const documentFormValuesSchema = z.object({
  supplierId: z.string(),
  customerId: z.string(),
  sourceWarehouseId: z.string(),
  targetWarehouseId: z.string(),
  warehouseId: z.string(),
  lines: z.array(documentLineDraftSchema),
});

export type DocumentLineDraft = z.infer<typeof documentLineDraftSchema>;
export type DocumentFormValues = z.infer<typeof documentFormValuesSchema>;

export function documentFormSchema(documentType: DraftDocumentType) {
  return documentFormValuesSchema.superRefine((values, ctx) => {
    const isReturn = documentType === "SALE_RETURN" || documentType === "PURCHASE_RETURN";

    if (isReturn) {
      values.lines.forEach((line, index) => {
        if (line.originalLineId.trim() === "") {
          ctx.addIssue({
            code: "custom",
            message: `第 ${index + 1} 行缺少原单据行引用`,
            path: ["lines", index, "originalLineId"],
          });
        }
      });
    }

    if (documentType === "PURCHASE_INBOUND") {
      if (values.supplierId.trim() === "") {
        ctx.addIssue({ code: "custom", message: "缺少供应商", path: ["supplierId"] });
      }
      if (values.targetWarehouseId.trim() === "") {
        ctx.addIssue({
          code: "custom",
          message: "缺少目标仓库",
          path: ["targetWarehouseId"],
        });
      }
    }

    if (documentType === "SALE_OUTBOUND") {
      if (values.customerId.trim() === "") {
        ctx.addIssue({ code: "custom", message: "缺少客户", path: ["customerId"] });
      }
      if (values.sourceWarehouseId.trim() === "") {
        ctx.addIssue({
          code: "custom",
          message: "缺少来源仓库",
          path: ["sourceWarehouseId"],
        });
      }
    }

    if (isReturn) {
      if (values.sourceWarehouseId.trim() === "") {
        ctx.addIssue({
          code: "custom",
          message: "缺少来源仓库",
          path: ["sourceWarehouseId"],
        });
      }
    }

    if (documentType === "TRANSFER") {
      if (values.sourceWarehouseId.trim() === "") {
        ctx.addIssue({ code: "custom", message: "缺少源仓", path: ["sourceWarehouseId"] });
      }
      if (values.targetWarehouseId.trim() === "") {
        ctx.addIssue({ code: "custom", message: "缺少目标仓", path: ["targetWarehouseId"] });
      }
      if (
        values.sourceWarehouseId.trim() !== "" &&
        values.targetWarehouseId.trim() !== "" &&
        values.sourceWarehouseId.trim() === values.targetWarehouseId.trim()
      ) {
        ctx.addIssue({
          code: "custom",
          message: "源仓与目标仓必须不同",
          path: ["sourceWarehouseId"],
        });
      }
    }

    if (documentType === "STOCKTAKE") {
      if (values.warehouseId.trim() === "") {
        ctx.addIssue({ code: "custom", message: "缺少仓库", path: ["warehouseId"] });
      }
    }
  });
}
