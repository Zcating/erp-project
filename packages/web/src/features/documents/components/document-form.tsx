import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { itemListQueryOptions } from "@/features/items";
import {
  customerListQueryOptions,
  supplierListQueryOptions,
  warehouseListQueryOptions,
} from "@/features/parties";
import type { Document, DocumentInput, DraftDocumentType, FormSubmitResult } from "../lib/api";
import { DRAFT_DOCUMENT_TYPES } from "../lib/api";
import { computeLineAmount, DOCUMENT_TYPE_LABELS } from "../lib/format";

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
};

const emptyLine = (): LineDraft => ({ itemId: "", quantity: "", unitPrice: "" });

export function DocumentForm({
  documentType,
  onDocumentTypeChange,
  initialDocument,
  submitLabel,
  onSubmit,
}: DocumentFormProps) {
  const priced = documentType !== "STOCKTAKE";
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
        })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { data: items } = useQuery(itemListQueryOptions());
  const { data: suppliers } = useQuery(supplierListQueryOptions());
  const { data: customers } = useQuery(customerListQueryOptions());
  const { data: warehouses } = useQuery(warehouseListQueryOptions());

  const updateLine = (index: number, patch: Partial<LineDraft>): void => {
    setLines((current) =>
      current.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    );
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
        (documentType === "SALE_OUTBOUND" || documentType === "TRANSFER") &&
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
      })),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
    }
  };

  const needsSupplier = documentType === "PURCHASE_INBOUND";
  const needsCustomer = documentType === "SALE_OUTBOUND";
  const needsSourceWarehouse = documentType === "SALE_OUTBOUND" || documentType === "TRANSFER";
  const needsTargetWarehouse = documentType === "PURCHASE_INBOUND" || documentType === "TRANSFER";
  const needsWarehouse = documentType === "STOCKTAKE";

  return (
    <form data-testid="document-form" className="max-w-3xl space-y-4" onSubmit={handleSubmit}>
      {onDocumentTypeChange === undefined ? null : (
        <label className="block text-sm" htmlFor="document-type">
          单据类型
          <select
            id="document-type"
            data-testid="document-type"
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={documentType}
            onChange={(event) => onDocumentTypeChange(event.target.value as DraftDocumentType)}
          >
            {DRAFT_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      )}

      {needsSupplier ? (
        <label className="block text-sm" htmlFor="document-supplier">
          供应商
          <select
            id="document-supplier"
            data-testid="document-supplier"
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            <option value="">请选择供应商</option>
            {(suppliers ?? []).map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.code} {supplier.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {needsCustomer ? (
        <label className="block text-sm" htmlFor="document-customer">
          客户
          <select
            id="document-customer"
            data-testid="document-customer"
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">请选择客户</option>
            {(customers ?? []).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.code} {customer.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {needsSourceWarehouse ? (
        <label className="block text-sm" htmlFor="document-source-warehouse">
          {documentType === "TRANSFER" ? "源仓" : "来源仓库"}
          <select
            id="document-source-warehouse"
            data-testid="document-source-warehouse"
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={sourceWarehouseId}
            onChange={(event) => setSourceWarehouseId(event.target.value)}
          >
            <option value="">请选择仓库</option>
            {(warehouses ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} {warehouse.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {needsTargetWarehouse ? (
        <label className="block text-sm" htmlFor="document-target-warehouse">
          {documentType === "TRANSFER" ? "目标仓" : "目标仓库"}
          <select
            id="document-target-warehouse"
            data-testid="document-target-warehouse"
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={targetWarehouseId}
            onChange={(event) => setTargetWarehouseId(event.target.value)}
          >
            <option value="">请选择仓库</option>
            {(warehouses ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} {warehouse.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {needsWarehouse ? (
        <label className="block text-sm" htmlFor="document-warehouse">
          仓库
          <select
            id="document-warehouse"
            data-testid="document-warehouse"
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
          >
            <option value="">请选择仓库</option>
            {(warehouses ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} {warehouse.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <fieldset className="space-y-2" data-testid="document-lines">
        <legend className="text-sm">单据行</legend>
        {lines.map((line, index) => (
          <div key={index} className="flex items-end gap-2" data-testid="document-line">
            <label className="block text-sm" htmlFor={`document-line-item-${index}`}>
              商品
              <select
                id={`document-line-item-${index}`}
                data-testid="document-line-item"
                className="mt-1 block w-56 rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={line.itemId}
                onChange={(event) => updateLine(index, { itemId: event.target.value })}
              >
                <option value="">请选择商品</option>
                {(items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm" htmlFor={`document-line-quantity-${index}`}>
              {priced ? "数量" : "实盘数量"}
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
              {priced ? (computeLineAmount(line.quantity, line.unitPrice) ?? "—") : "—"}
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
        ))}
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
