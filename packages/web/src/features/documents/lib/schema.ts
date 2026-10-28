import { z } from "zod";
import type { DraftDocumentType } from "@/server";
import {
  DOCUMENT_FORM_RULES,
  missingPartyMessage,
  missingWarehouseMessage,
  partyFieldOf,
  partyValueOf,
  requiresDistinctWarehouses,
  warehouseFieldOf,
  warehouseValueOf,
} from "./rules";

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
    const rule = DOCUMENT_FORM_RULES[documentType];

    if (rule.requiresOriginalLine) {
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

    if (rule.party !== null) {
      if (partyValueOf(values, rule.party).trim() === "") {
        ctx.addIssue({
          code: "custom",
          message: missingPartyMessage(rule.party),
          path: [partyFieldOf(rule.party)],
        });
      }
    }

    for (const role of rule.warehouses) {
      if (warehouseValueOf(values, role).trim() === "") {
        ctx.addIssue({
          code: "custom",
          message: missingWarehouseMessage(rule, role),
          path: [warehouseFieldOf(role)],
        });
      }
    }

    if (
      requiresDistinctWarehouses(rule) &&
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
  });
}
