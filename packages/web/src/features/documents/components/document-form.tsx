import { useForm, useSelector } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import { conversionRateOf, itemListQueryOptions, itemOptions, unitOptions } from "@/features/items";
import {
  customerListQueryOptions,
  customerOptions,
  supplierListQueryOptions,
  supplierOptions,
  warehouseListQueryOptions,
  warehouseOptionsWithCode,
} from "@/features/parties";
import type { Document, DocumentInput, DraftDocumentType } from "@/server";
import { DRAFT_DOCUMENT_TYPES } from "@/server";
import type { FormSubmitResult } from "@/shared/form";
import { computeLineAmount, DOCUMENT_TYPE_LABELS } from "../lib/format";
import { documentTypeOptions, originalLineChoices } from "../lib/options";
import { buildDocumentInput } from "../lib/payload";
import { originalCandidateQueryOptions } from "../lib/queries";
import { DOCUMENT_FORM_RULES } from "../lib/rules";
import { documentFormSchema, type DocumentLineDraft } from "../lib/schema";

export type DocumentFormProps = {
  documentType: DraftDocumentType;
  onDocumentTypeChange?: (documentType: DraftDocumentType) => void;
  initialDocument?: Document;
  submitLabel: string;
  onSubmit: (input: DocumentInput) => Promise<FormSubmitResult>;
};

const emptyLine = (): DocumentLineDraft => ({
  itemId: "",
  quantity: "",
  unitPrice: "",
  unit: "",
  originalLineId: "",
});

const ORIGINAL_LINE_LABELS: Record<string, string> = {
  SALE_OUTBOUND: "原销售出库行",
  PURCHASE_INBOUND: "原采购入库行",
};

export function DocumentForm({
  documentType,
  onDocumentTypeChange,
  initialDocument,
  submitLabel,
  onSubmit,
}: DocumentFormProps) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      supplierId: initialDocument?.supplierId ?? "",
      customerId: initialDocument?.customerId ?? "",
      sourceWarehouseId: initialDocument?.sourceWarehouseId ?? "",
      targetWarehouseId: initialDocument?.targetWarehouseId ?? "",
      warehouseId: initialDocument?.warehouseId ?? "",
      lines:
        initialDocument === undefined
          ? [emptyLine()]
          : initialDocument.lines.map((line) => ({
              itemId: line.itemId,
              quantity: line.quantity,
              unitPrice: line.unitPrice ?? "",
              unit: "",
              originalLineId: line.originalLineId ?? "",
            })),
    },
    onSubmit: async ({ value }) => {
      const parsed = documentFormSchema(documentType).safeParse(value);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "提交失败");
        return;
      }
      setError(null);
      const result = await onSubmit(buildDocumentInput(parsed.data, documentType));
      if (!result.ok) {
        setError(result.message);
      }
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  const rule = DOCUMENT_FORM_RULES[documentType];
  const priced = rule.priced;
  const requiresOriginalLine = rule.requiresOriginalLine;
  const originalDocumentLabel =
    rule.originalType === null ? "" : DOCUMENT_TYPE_LABELS[rule.originalType];

  const { data: items } = useQuery(itemListQueryOptions());
  const { data: suppliers } = useQuery(supplierListQueryOptions());
  const { data: customers } = useQuery(customerListQueryOptions());
  const { data: warehouses } = useQuery(warehouseListQueryOptions());
  const { data: originalDocuments } = useQuery({
    ...originalCandidateQueryOptions(rule.originalType ?? ""),
    enabled: rule.originalType !== null,
  });

  const originalChoices = originalLineChoices(
    originalDocuments ?? [],
    items ?? [],
    rule.originalType === "PURCHASE_INBOUND" ? "已入" : "已出",
    (document) =>
      rule.originalWarehouseRole === "TARGET"
        ? (document.targetWarehouseId ?? "")
        : (document.sourceWarehouseId ?? ""),
  );

  const originalLinePickerOptions = [
    {
      value: "",
      label: `请选择原${originalDocumentLabel}的行`,
    },
    ...originalChoices.map((choice) => ({ value: choice.value, label: choice.label })),
  ];

  const updateLine = (index: number, patch: Partial<DocumentLineDraft>): void => {
    form.setFieldValue("lines", (lines) =>
      lines.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    );
  };

  const selectOriginalLine = (index: number, originalLineId: string): void => {
    const choice = originalChoices.find((candidate) => candidate.value === originalLineId);
    updateLine(index, {
      originalLineId,
      itemId: choice?.itemId ?? "",
      unit: "",
    });
    if (choice !== undefined) {
      form.setFieldValue("sourceWarehouseId", choice.warehouseId);
    }
  };

  const needsSupplier = rule.party === "SUPPLIER";
  const needsCustomer = rule.party === "CUSTOMER";
  const needsSourceWarehouse = rule.warehouses.includes("SOURCE");
  const needsTargetWarehouse = rule.warehouses.includes("TARGET");
  const needsWarehouse = rule.warehouses.includes("COUNT");

  return (
    <form
      data-testid="document-form"
      className="max-w-3xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {onDocumentTypeChange === undefined ? null : (
        <div>
          <Label id="document-type-label" htmlFor="document-type" className="block text-sm">
            单据类型
          </Label>
          <Picker
            id="document-type"
            className="mt-1 w-full"
            value={documentType}
            onValueChange={(value) => onDocumentTypeChange(value as DraftDocumentType)}
            options={documentTypeOptions(DRAFT_DOCUMENT_TYPES)}
            data-testid="document-type"
            aria-labelledby="document-type-label"
          />
        </div>
      )}

      {needsSupplier ? (
        <div>
          <Label id="document-supplier-label" htmlFor="document-supplier" className="block text-sm">
            供应商
          </Label>
          <Picker
            id="document-supplier"
            className="mt-1 w-full"
            value={values.supplierId}
            onValueChange={(value) => form.setFieldValue("supplierId", value)}
            options={[{ value: "", label: "请选择供应商" }, ...supplierOptions(suppliers ?? [])]}
            data-testid="document-supplier"
            aria-labelledby="document-supplier-label"
          />
        </div>
      ) : null}

      {needsCustomer ? (
        <div>
          <Label id="document-customer-label" htmlFor="document-customer" className="block text-sm">
            客户
          </Label>
          <Picker
            id="document-customer"
            className="mt-1 w-full"
            value={values.customerId}
            onValueChange={(value) => form.setFieldValue("customerId", value)}
            options={[{ value: "", label: "请选择客户" }, ...customerOptions(customers ?? [])]}
            data-testid="document-customer"
            aria-labelledby="document-customer-label"
          />
        </div>
      ) : null}

      {needsSourceWarehouse ? (
        <div>
          <Label
            id="document-source-warehouse-label"
            htmlFor="document-source-warehouse"
            className="block text-sm"
          >
            {requiresOriginalLine
              ? `${rule.originalWarehouseRole === "TARGET" ? "退货出库仓" : "退货入库仓"}（取自原${originalDocumentLabel}）`
              : rule.shortWarehouseLabels
                ? "源仓"
                : "来源仓库"}
          </Label>
          <Picker
            id="document-source-warehouse"
            className="mt-1 w-full"
            value={values.sourceWarehouseId}
            onValueChange={(value) => form.setFieldValue("sourceWarehouseId", value)}
            options={[
              { value: "", label: "请选择仓库" },
              ...warehouseOptionsWithCode(warehouses ?? []),
            ]}
            disabled={requiresOriginalLine}
            data-testid="document-source-warehouse"
            aria-labelledby="document-source-warehouse-label"
          />
        </div>
      ) : null}

      {needsTargetWarehouse ? (
        <div>
          <Label
            id="document-target-warehouse-label"
            htmlFor="document-target-warehouse"
            className="block text-sm"
          >
            {rule.shortWarehouseLabels ? "目标仓" : "目标仓库"}
          </Label>
          <Picker
            id="document-target-warehouse"
            className="mt-1 w-full"
            value={values.targetWarehouseId}
            onValueChange={(value) => form.setFieldValue("targetWarehouseId", value)}
            options={[
              { value: "", label: "请选择仓库" },
              ...warehouseOptionsWithCode(warehouses ?? []),
            ]}
            data-testid="document-target-warehouse"
            aria-labelledby="document-target-warehouse-label"
          />
        </div>
      ) : null}

      {needsWarehouse ? (
        <div>
          <Label
            id="document-warehouse-label"
            htmlFor="document-warehouse"
            className="block text-sm"
          >
            仓库
          </Label>
          <Picker
            id="document-warehouse"
            className="mt-1 w-full"
            value={values.warehouseId}
            onValueChange={(value) => form.setFieldValue("warehouseId", value)}
            options={[
              { value: "", label: "请选择仓库" },
              ...warehouseOptionsWithCode(warehouses ?? []),
            ]}
            data-testid="document-warehouse"
            aria-labelledby="document-warehouse-label"
          />
        </div>
      ) : null}

      <fieldset className="space-y-2" data-testid="document-lines">
        <legend className="text-sm">单据行</legend>
        {values.lines.map((line, index) => {
          const item = (items ?? []).find((candidate) => candidate.id === line.itemId);
          const unitChoices = unitOptions(item);
          const unitPickerOptions =
            unitChoices.length === 0 ? [{ value: "", label: "—" }] : unitChoices;
          const rate = conversionRateOf(item, line.unit);
          return (
            <div key={index} className="flex items-end gap-2" data-testid="document-line">
              {requiresOriginalLine ? (
                <div>
                  <Label
                    id={`document-line-original-label-${index}`}
                    htmlFor={`document-line-original-${index}`}
                    className="block text-sm"
                  >
                    {ORIGINAL_LINE_LABELS[rule.originalType ?? ""] ?? ""}
                  </Label>
                  <Picker
                    id={`document-line-original-${index}`}
                    className="mt-1 w-96"
                    value={line.originalLineId}
                    onValueChange={(value) => selectOriginalLine(index, value)}
                    options={originalLinePickerOptions}
                    data-testid="document-line-original"
                    aria-labelledby={`document-line-original-label-${index}`}
                  />
                </div>
              ) : null}
              <div>
                <Label
                  id={`document-line-item-label-${index}`}
                  htmlFor={`document-line-item-${index}`}
                  className="block text-sm"
                >
                  商品
                </Label>
                <Picker
                  id={`document-line-item-${index}`}
                  className="mt-1 w-56"
                  value={line.itemId}
                  onValueChange={(value) => updateLine(index, { itemId: value, unit: "" })}
                  options={[{ value: "", label: "请选择商品" }, ...itemOptions(items ?? [])]}
                  disabled={requiresOriginalLine}
                  data-testid="document-line-item"
                  aria-labelledby={`document-line-item-label-${index}`}
                />
              </div>
              <div>
                <Label
                  id={`document-line-unit-label-${index}`}
                  htmlFor={`document-line-unit-${index}`}
                  className="block text-sm"
                >
                  单位
                </Label>
                <Picker
                  id={`document-line-unit-${index}`}
                  className="mt-1 w-24"
                  value={line.unit}
                  onValueChange={(value) => updateLine(index, { unit: value })}
                  options={unitPickerOptions}
                  placeholder=""
                  disabled={unitChoices.length === 0 || requiresOriginalLine}
                  data-testid="document-line-unit"
                  aria-labelledby={`document-line-unit-label-${index}`}
                />
              </div>
              <div>
                <Label htmlFor={`document-line-quantity-${index}`} className="block text-sm">
                  {priced ? "数量" : requiresOriginalLine ? "退货数量" : "实盘数量"}
                </Label>
                <Input
                  id={`document-line-quantity-${index}`}
                  data-testid="document-line-quantity"
                  className="mt-1 w-28"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                />
              </div>
              {priced ? (
                <div>
                  <Label htmlFor={`document-line-unit-price-${index}`} className="block text-sm">
                    单价
                  </Label>
                  <Input
                    id={`document-line-unit-price-${index}`}
                    data-testid="document-line-unit-price"
                    className="mt-1 w-28"
                    value={line.unitPrice}
                    onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                  />
                </div>
              ) : null}
              <span className="text-sm" data-testid="document-line-amount">
                {priced ? (computeLineAmount(line.quantity, line.unitPrice, rate) ?? "—") : "—"}
              </span>
              <Button
                type="button"
                variant="outline"
                data-testid="document-line-remove"
                onClick={() => void form.removeFieldValue("lines", index)}
              >
                移除
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          data-testid="document-line-add"
          onClick={() => form.pushFieldValue("lines", emptyLine())}
        >
          添加单据行
        </Button>
      </fieldset>

      {error === null ? null : (
        <p data-testid="document-form-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" data-testid="document-submit" disabled={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
