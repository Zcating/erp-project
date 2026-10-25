import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { FormSubmitResult, ItemAuxiliaryUnit, ItemInput, ItemMaster } from "../lib/api";
import { displayConversionRate } from "../lib/format";

export type ItemFormProps = {
  initialItem?: ItemMaster;
  submitLabel: string;
  onSubmit: (input: ItemInput) => Promise<FormSubmitResult>;
};

export function ItemForm({ initialItem, submitLabel, onSubmit }: ItemFormProps) {
  const [code, setCode] = useState(initialItem?.code ?? "");
  const [barcode, setBarcode] = useState(initialItem?.barcode ?? "");
  const [name, setName] = useState(initialItem?.name ?? "");
  const [specification, setSpecification] = useState(initialItem?.specification ?? "");
  const [brand, setBrand] = useState(initialItem?.brand ?? "");
  const [category, setCategory] = useState(initialItem?.category ?? "");
  const [baseUnit, setBaseUnit] = useState(initialItem?.baseUnit ?? "");
  const [auxiliaryUnits, setAuxiliaryUnits] = useState<ItemAuxiliaryUnit[]>(
    initialItem?.auxiliaryUnits.map((auxiliaryUnit) => ({
      unit: auxiliaryUnit.unit,
      conversionRate: displayConversionRate(auxiliaryUnit.conversionRate),
    })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const updateAuxiliaryUnit = (index: number, patch: Partial<ItemAuxiliaryUnit>): void => {
    setAuxiliaryUnits((current) =>
      current.map((auxiliaryUnit, position) =>
        position === index ? { ...auxiliaryUnit, ...patch } : auxiliaryUnit,
      ),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await onSubmit({
      code,
      barcode: barcode.trim() === "" ? null : barcode.trim(),
      name,
      specification: specification.trim() === "" ? null : specification.trim(),
      brand: brand.trim() === "" ? null : brand.trim(),
      category: category.trim() === "" ? null : category.trim(),
      baseUnit,
      auxiliaryUnits: auxiliaryUnits.map((auxiliaryUnit) => ({
        unit: auxiliaryUnit.unit,
        conversionRate: auxiliaryUnit.conversionRate,
      })),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
    }
  };

  return (
    <form data-testid="item-form" className="max-w-2xl space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm" htmlFor="item-code">
        商品编码
        <input
          id="item-code"
          data-testid="item-code"
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>

      <label className="block text-sm" htmlFor="item-barcode">
        商品条码
        <input
          id="item-barcode"
          data-testid="item-barcode"
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={barcode}
          onChange={(event) => setBarcode(event.target.value)}
        />
      </label>

      <label className="block text-sm" htmlFor="item-name">
        名称
        <input
          id="item-name"
          data-testid="item-name"
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="block text-sm" htmlFor="item-specification">
        规格
        <input
          id="item-specification"
          data-testid="item-specification"
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={specification}
          onChange={(event) => setSpecification(event.target.value)}
        />
      </label>

      <label className="block text-sm" htmlFor="item-brand">
        品牌
        <input
          id="item-brand"
          data-testid="item-brand"
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={brand}
          onChange={(event) => setBrand(event.target.value)}
        />
      </label>

      <label className="block text-sm" htmlFor="item-category">
        商品分类
        <input
          id="item-category"
          data-testid="item-category"
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
      </label>

      <label className="block text-sm" htmlFor="item-base-unit">
        基本计量单位
        <input
          id="item-base-unit"
          data-testid="item-base-unit"
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={baseUnit}
          onChange={(event) => setBaseUnit(event.target.value)}
        />
      </label>

      <fieldset className="space-y-2" data-testid="item-auxiliary-units">
        <legend className="text-sm">辅助计量单位与单位换算率</legend>
        {auxiliaryUnits.map((auxiliaryUnit, index) => (
          <div key={index} className="flex items-end gap-2" data-testid="item-aux-row">
            <label className="block text-sm" htmlFor={`item-aux-unit-${index}`}>
              单位
              <input
                id={`item-aux-unit-${index}`}
                data-testid="item-aux-unit"
                className="mt-1 block w-32 rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={auxiliaryUnit.unit}
                onChange={(event) => updateAuxiliaryUnit(index, { unit: event.target.value })}
              />
            </label>
            <label className="block text-sm" htmlFor={`item-aux-rate-${index}`}>
              单位换算率
              <input
                id={`item-aux-rate-${index}`}
                data-testid="item-aux-rate"
                className="mt-1 block w-32 rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={auxiliaryUnit.conversionRate}
                onChange={(event) =>
                  updateAuxiliaryUnit(index, { conversionRate: event.target.value })
                }
              />
            </label>
            <Button
              type="button"
              variant="outline"
              data-testid="item-aux-remove"
              onClick={() =>
                setAuxiliaryUnits((current) => current.filter((_, position) => position !== index))
              }
            >
              移除
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          data-testid="item-aux-add"
          onClick={() =>
            setAuxiliaryUnits((current) => [...current, { unit: "", conversionRate: "" }])
          }
        >
          添加辅助计量单位
        </Button>
      </fieldset>

      {error === null ? null : (
        <p data-testid="item-form-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" data-testid="item-submit" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
