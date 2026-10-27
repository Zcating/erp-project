import { useForm, useSelector } from "@tanstack/react-form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormSubmitResult, ItemInput, ItemMaster } from "../lib/api";
import { displayConversionRate } from "../lib/format";
import { buildItemInput } from "../lib/payload";
import { itemFormSchema } from "../lib/schema";

export type ItemFormProps = {
  initialItem?: ItemMaster;
  submitLabel: string;
  onSubmit: (input: ItemInput) => Promise<FormSubmitResult>;
};

export function ItemForm({ initialItem, submitLabel, onSubmit: submitItem }: ItemFormProps) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      code: initialItem?.code ?? "",
      barcode: initialItem?.barcode ?? "",
      name: initialItem?.name ?? "",
      specification: initialItem?.specification ?? "",
      brand: initialItem?.brand ?? "",
      category: initialItem?.category ?? "",
      baseUnit: initialItem?.baseUnit ?? "",
      auxiliaryUnits:
        initialItem?.auxiliaryUnits.map((auxiliaryUnit) => ({
          unit: auxiliaryUnit.unit,
          conversionRate: displayConversionRate(auxiliaryUnit.conversionRate),
        })) ?? [],
    },
    onSubmit: async ({ value }) => {
      const parsed = itemFormSchema.safeParse(value);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "提交失败");
        return;
      }
      setError(null);
      const result = await submitItem(buildItemInput(parsed.data));
      if (!result.ok) {
        setError(result.message);
      }
    },
  });
  const values = useSelector(form.store, (state) => state.values);
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);

  return (
    <form
      data-testid="item-form"
      className="max-w-2xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div>
        <Label htmlFor="item-code" className="block text-sm">
          商品编码
        </Label>
        <Input
          id="item-code"
          data-testid="item-code"
          className="mt-1 w-full"
          value={values.code}
          onChange={(event) => form.setFieldValue("code", event.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="item-barcode" className="block text-sm">
          商品条码
        </Label>
        <Input
          id="item-barcode"
          data-testid="item-barcode"
          className="mt-1 w-full"
          value={values.barcode}
          onChange={(event) => form.setFieldValue("barcode", event.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="item-name" className="block text-sm">
          名称
        </Label>
        <Input
          id="item-name"
          data-testid="item-name"
          className="mt-1 w-full"
          value={values.name}
          onChange={(event) => form.setFieldValue("name", event.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="item-specification" className="block text-sm">
          规格
        </Label>
        <Input
          id="item-specification"
          data-testid="item-specification"
          className="mt-1 w-full"
          value={values.specification}
          onChange={(event) => form.setFieldValue("specification", event.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="item-brand" className="block text-sm">
          品牌
        </Label>
        <Input
          id="item-brand"
          data-testid="item-brand"
          className="mt-1 w-full"
          value={values.brand}
          onChange={(event) => form.setFieldValue("brand", event.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="item-category" className="block text-sm">
          商品分类
        </Label>
        <Input
          id="item-category"
          data-testid="item-category"
          className="mt-1 w-full"
          value={values.category}
          onChange={(event) => form.setFieldValue("category", event.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="item-base-unit" className="block text-sm">
          基本计量单位
        </Label>
        <Input
          id="item-base-unit"
          data-testid="item-base-unit"
          className="mt-1 w-full"
          value={values.baseUnit}
          onChange={(event) => form.setFieldValue("baseUnit", event.target.value)}
        />
      </div>

      <fieldset className="space-y-2" data-testid="item-auxiliary-units">
        <legend className="text-sm">辅助计量单位与单位换算率</legend>
        {values.auxiliaryUnits.map((auxiliaryUnit, index) => (
          <div key={index} className="flex items-end gap-2" data-testid="item-aux-row">
            <div>
              <Label htmlFor={`item-aux-unit-${index}`} className="block text-sm">
                单位
              </Label>
              <Input
                id={`item-aux-unit-${index}`}
                data-testid="item-aux-unit"
                className="mt-1 w-32"
                value={auxiliaryUnit.unit}
                onChange={(event) =>
                  form.setFieldValue("auxiliaryUnits", (units) =>
                    units.map((unit, position) =>
                      position === index ? { ...unit, unit: event.target.value } : unit,
                    ),
                  )
                }
              />
            </div>
            <div>
              <Label htmlFor={`item-aux-rate-${index}`} className="block text-sm">
                单位换算率
              </Label>
              <Input
                id={`item-aux-rate-${index}`}
                data-testid="item-aux-rate"
                className="mt-1 w-32"
                value={auxiliaryUnit.conversionRate}
                onChange={(event) =>
                  form.setFieldValue("auxiliaryUnits", (units) =>
                    units.map((unit, position) =>
                      position === index ? { ...unit, conversionRate: event.target.value } : unit,
                    ),
                  )
                }
              />
            </div>
            <Button
              type="button"
              variant="outline"
              data-testid="item-aux-remove"
              onClick={() => void form.removeFieldValue("auxiliaryUnits", index)}
            >
              移除
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          data-testid="item-aux-add"
          onClick={() => form.pushFieldValue("auxiliaryUnits", { unit: "", conversionRate: "" })}
        >
          添加辅助计量单位
        </Button>
      </fieldset>

      {error === null ? null : (
        <p data-testid="item-form-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" data-testid="item-submit" disabled={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
