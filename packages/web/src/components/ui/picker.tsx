import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

export type PickerOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export const PICKER_EMPTY_SENTINEL_BASE = "\u0000";

export type PickerValueMapping = {
  emptySentinel: string;
  toInternal: (externalValue: string) => string;
  toExternal: (internalValue: string) => string;
};

export type PickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly PickerOption[];
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  "data-testid"?: string | undefined;
};

function emptySentinelOf(options: readonly PickerOption[]): string {
  let sentinel = PICKER_EMPTY_SENTINEL_BASE;
  while (options.some((option) => option.value === sentinel)) {
    sentinel += PICKER_EMPTY_SENTINEL_BASE;
  }
  return sentinel;
}

export function createPickerValueMapping(options: readonly PickerOption[]): PickerValueMapping {
  const emptySentinel = emptySentinelOf(options);
  const optionValues = new Set(options.map((option) => option.value));

  return {
    emptySentinel,
    toInternal: (externalValue) => {
      if (!optionValues.has(externalValue)) {
        return "";
      }
      return externalValue === "" ? emptySentinel : externalValue;
    },
    toExternal: (internalValue) => (internalValue === emptySentinel ? "" : internalValue),
  };
}

export function pickerSelectedLabel(
  options: readonly PickerOption[],
  externalValue: string,
): string | undefined {
  return options.find((option) => option.value === externalValue)?.label;
}

export function Picker({
  value,
  onValueChange,
  options,
  placeholder = "请选择",
  disabled = false,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "data-testid": dataTestId,
}: PickerProps) {
  const mapping = createPickerValueMapping(options);
  const label = pickerSelectedLabel(options, value);

  return (
    <Select
      value={mapping.toInternal(value)}
      onValueChange={(internalValue) => onValueChange(mapping.toExternal(internalValue))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className={className}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        data-testid={dataTestId}
      >
        <SelectValue placeholder={placeholder}>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => {
          const internalValue = mapping.toInternal(option.value);
          return (
            <SelectItem
              key={internalValue}
              value={internalValue}
              data-value={option.value}
              disabled={option.disabled ?? false}
            >
              {option.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
