import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import { itemListQueryOptions } from "@/features/items";
import type { ItemMaster } from "@/features/items";
import {
  customerListQueryOptions,
  supplierListQueryOptions,
  warehouseListQueryOptions,
} from "@/features/parties";
import type { Document, DocumentInput, DraftDocumentType, FormSubmitResult } from "../lib/api";
import { DRAFT_DOCUMENT_TYPES } from "../lib/api";
import { computeLineAmount } from "../lib/format";
import {
  customerOptions,
  documentTypeOptions,
  itemOptions,
  originalLineChoices,
  supplierOptions,
  unitNames,
  unitOptions,
  warehouseOptions,
} from "../lib/options";
import { documentListQueryOptions } from "../lib/queries";

export type DocumentFormProps = {
  documentType: DraftDocumentType;
  onDocumentTypeChange?: (documentType: DraftDocumentType) => void;
  initialDocument?: Document;
  submitLabel: string;
  onSubmit: (input: DocumentInput) => Promise<FormSubmitResult>;
};

type LineDraft = {
  itemId: string;
  quantity: string;
  unitPrice: string;
  unit: string;
  originalLineId: string;
};

const emptyLine = (): LineDraft => ({
  itemId: "",
  quantity: "",
  unitPrice: "",
  unit: "",
  originalLineId: "",
});

const conversionRateOf = (item: ItemMaster | undefined, unit: string): string => {
  if (item === undefined || unit === "" || unit === item.baseUnit) {
    return "1";
  }
  const auxiliary = item.auxiliaryUnits.find((candidate) => candidate.unit === unit);
  return auxiliary?.conversionRate ?? "1";
};

export function DocumentForm({
  documentType,
  onDocumentTypeChange,
  initialDocument,
  submitLabel,
  onSubmit,
}: DocumentFormProps) {
  const isSaleReturn = documentType === "SALE_RETURN";
  const isPurchaseReturn = documentType === "PURCHASE_RETURN";
  const isReturn = isSaleReturn || isPurchaseReturn;
  const priced = documentType !== "STOCKTAKE" && !isReturn;
  const [supplierId, setSupplierId] = useState(initialDocument?.supplierId ?? "");
  const [customerId, setCustomerId] = useState(initialDocument?.customerId ?? "");
  const [sourceWarehouseId, setSourceWarehouseId] = useState(
    initialDocument?.sourceWarehouseId ?? "",
  );
  const [targetWarehouseId, setTargetWarehouseId] = useState(
    initialDocument?.targetWarehouseId ?? "",
  );
  const [warehouseId, setWarehouseId] = useState(initialDocument?.warehouseId ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    initialDocument === undefined
      ? [emptyLine()]
      : initialDocument.lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice ?? "",
          unit: "",
          originalLineId: line.originalLineId ?? "",
        })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { data: items } = useQuery(itemListQueryOptions());
  const { data: suppliers } = useQuery(supplierListQueryOptions());
  const { data: customers } = useQuery(customerListQueryOptions());
  const { data: warehouses } = useQuery(warehouseListQueryOptions());
  const { data: outboundDocuments } = useQuery({
    ...documentListQueryOptions("SALE_OUTBOUND", "POSTED"),
    enabled: isSaleReturn,
  });
  const { data: inboundDocuments } = useQuery({
    ...documentListQueryOptions("PURCHASE_INBOUND", "POSTED"),
    enabled: isPurchaseReturn,
  });

  const originalChoices = isPurchaseReturn
    ? originalLineChoices(
        inboundDocuments ?? [],
        items ?? [],
        "已入",
        (document) => document.targetWarehouseId ?? "",
      )
    : originalLineChoices(
        outboundDocuments ?? [],
        items ?? [],
        "已出",
        (document) => document.sourceWarehouseId ?? "",
      );

  const originalLinePickerOptions = [
    {
      value: "",
      label: isPurchaseReturn ? "请选择原采购入库单的行" : "请选择原销售出库单的行",
    },
    ...originalChoices.map((choice) => ({ value: choice.value, label: choice.label })),
  ];

  const updateLine = (index: number, patch: Partial<LineDraft>): void => {
    setLines((current) =>
      current.map((line, position) => (position === index ? { ...line, ...patch } : line)),
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
      setSourceWarehouseId(choice.warehouseId);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await onSubmit({
      type: documentType,
      supplierId: documentType === "PURCHASE_INBOUND" && supplierId !== "" ? supplierId : null,
      customerId: documentType === "SALE_OUTBOUND" && customerId !== "" ? customerId : null,
      sourceWarehouseId:
        (documentType === "SALE_OUTBOUND" || documentType === "TRANSFER" || isReturn) &&
        sourceWarehouseId !== ""
          ? sourceWarehouseId
          : null,
      targetWarehouseId:
        (documentType === "PURCHASE_INBOUND" || documentType === "TRANSFER") &&
        targetWarehouseId !== ""
          ? targetWarehouseId
          : null,
      warehouseId: documentType === "STOCKTAKE" && warehouseId !== "" ? warehouseId : null,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitPrice: priced && line.unitPrice !== "" ? line.unitPrice : null,
        amount: null,
        unit: line.unit === "" ? null : line.unit,
        originalLineId: line.originalLineId === "" ? null : line.originalLineId,
      })),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
    }
  };

  const needsSupplier = documentType === "PURCHASE_INBOUND";
  const needsCustomer = documentType === "SALE_OUTBOUND";
  const needsSourceWarehouse =
    documentType === "SALE_OUTBOUND" || documentType === "TRANSFER" || isReturn;
  const needsTargetWarehouse = documentType === "PURCHASE_INBOUND" || documentType === "TRANSFER";
  const needsWarehouse = documentType === "STOCKTAKE";

  return (
    <form data-testid="document-form" className="max-w-3xl space-y-4" onSubmit={handleSubmit}>
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
            value={supplierId}
            onValueChange={setSupplierId}
            options={supplierOptions(suppliers ?? [])}
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
            value={customerId}
            onValueChange={setCustomerId}
            options={customerOptions(customers ?? [])}
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
            {isSaleReturn
              ? "退货入库仓（取自原销售出库单）"
              : isPurchaseReturn
                ? "退货出库仓（取自原采购入库单）"
                : documentType === "TRANSFER"
                  ? "源仓"
                  : "来源仓库"}
          </Label>
          <Picker
            id="document-source-warehouse"
            className="mt-1 w-full"
            value={sourceWarehouseId}
            onValueChange={setSourceWarehouseId}
            options={warehouseOptions(warehouses ?? [])}
            disabled={isReturn}
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
            {documentType === "TRANSFER" ? "目标仓" : "目标仓库"}
          </Label>
          <Picker
            id="document-target-warehouse"
            className="mt-1 w-full"
            value={targetWarehouseId}
            onValueChange={setTargetWarehouseId}
            options={warehouseOptions(warehouses ?? [])}
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
            value={warehouseId}
            onValueChange={setWarehouseId}
            options={warehouseOptions(warehouses ?? [])}
            data-testid="document-warehouse"
            aria-labelledby="document-warehouse-label"
          />
        </div>
      ) : null}

      <fieldset className="space-y-2" data-testid="document-lines">
        <legend className="text-sm">单据行</legend>
        {lines.map((line, index) => {
          const item = (items ?? []).find((candidate) => candidate.id === line.itemId);
          const units = unitNames(item);
          const unitChoices = unitOptions(item);
          const rate = conversionRateOf(item, line.unit);
          return (
            <div key={index} className="flex items-end gap-2" data-testid="document-line">
              {isReturn ? (
                <div>
                  <Label
                    id={`document-line-original-label-${index}`}
                    htmlFor={`document-line-original-${index}`}
                    className="block text-sm"
                  >
                    {isPurchaseReturn ? "原采购入库行" : "原销售出库行"}
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
                  options={itemOptions(items ?? [])}
                  disabled={isReturn}
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
                  options={unitChoices}
                  placeholder=""
                  disabled={units.length === 0 || isReturn}
                  data-testid="document-line-unit"
                  aria-labelledby={`document-line-unit-label-${index}`}
                />
              </div>
              <label className="block text-sm" htmlFor={`document-line-quantity-${index}`}>
                {priced ? "数量" : isReturn ? "退货数量" : "实盘数量"}
                <input
                  id={`document-line-quantity-${index}`}
                  data-testid="document-line-quantity"
                  className="mt-1 block w-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                />
              </label>
              {priced ? (
                <label className="block text-sm" htmlFor={`document-line-unit-price-${index}`}>
                  单价
                  <input
                    id={`document-line-unit-price-${index}`}
                    data-testid="document-line-unit-price"
                    className="mt-1 block w-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={line.unitPrice}
                    onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                  />
                </label>
              ) : null}
              <span className="text-sm" data-testid="document-line-amount">
                {priced ? (computeLineAmount(line.quantity, line.unitPrice, rate) ?? "—") : "—"}
              </span>
              <Button
                type="button"
                variant="outline"
                data-testid="document-line-remove"
                onClick={() =>
                  setLines((current) => current.filter((_, position) => position !== index))
                }
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
          onClick={() => setLines((current) => [...current, emptyLine()])}
        >
          添加单据行
        </Button>
      </fieldset>

      {error === null ? null : (
        <p data-testid="document-form-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" data-testid="document-submit" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
