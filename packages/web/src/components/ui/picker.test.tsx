import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createPickerValueMapping,
  PICKER_EMPTY_SENTINEL_BASE,
  pickerSelectedLabel,
  Picker,
  type PickerOption,
} from "./picker";

const options: readonly PickerOption[] = [
  { value: "", label: "全部" },
  { value: "PURCHASE_INBOUND", label: "采购入库" },
  { value: "SALE_OUTBOUND", label: "销售出库" },
];

describe("Picker 的取值映射", () => {
  it("候选集里的外部取值映射到互不相同的内部承载值", () => {
    const mapping = createPickerValueMapping(options);
    const internalValues = options.map((option) => mapping.toInternal(option.value));

    expect(new Set(internalValues).size).toBe(options.length);
  });

  it("承载空字符串的选项映射到非空哨兵值，哨兵不与任何真实选项取值相同", () => {
    const mapping = createPickerValueMapping(options);
    const sentinel = mapping.toInternal("");

    expect(sentinel).not.toBe("");
    expect(options.map((option) => option.value)).not.toContain(sentinel);
  });

  it("候选集里已经占用了哨兵字符时换一个哨兵", () => {
    const occupied: readonly PickerOption[] = [
      { value: PICKER_EMPTY_SENTINEL_BASE, label: "占用" },
      { value: "", label: "全部" },
    ];
    const mapping = createPickerValueMapping(occupied);

    expect(mapping.toInternal("")).not.toBe(PICKER_EMPTY_SENTINEL_BASE);
    expect(occupied.map((option) => option.value)).not.toContain(mapping.toInternal(""));
  });

  it("外部取值不在候选集里时映射为无选中", () => {
    const mapping = createPickerValueMapping(options);

    expect(mapping.toInternal("NOT_IN_OPTIONS")).toBe("");
  });

  it("回调时内部值原样映射回外部取值，哨兵映射回空字符串", () => {
    const mapping = createPickerValueMapping(options);

    for (const option of options) {
      expect(mapping.toExternal(mapping.toInternal(option.value))).toBe(option.value);
    }
    expect(mapping.toExternal("PURCHASE_INBOUND")).toBe("PURCHASE_INBOUND");
  });
});

describe("Picker 触发器文案", () => {
  it("文案直接取自当前选中项", () => {
    expect(pickerSelectedLabel(options, "PURCHASE_INBOUND")).toBe("采购入库");
    expect(pickerSelectedLabel(options, "")).toBe("全部");
  });

  it("外部取值为空字符串且候选集里没有空字符串项时没有选中项文案", () => {
    const withoutEmpty = options.filter((option) => option.value !== "");

    expect(pickerSelectedLabel(withoutEmpty, "")).toBeUndefined();
  });

  it("外部取值不在候选集里时没有选中项文案", () => {
    expect(pickerSelectedLabel(options, "NOT_IN_OPTIONS")).toBeUndefined();
  });
});

describe("Picker 的触发器渲染", () => {
  it("触发器直接渲染当前选中项的文案，不等选项挂载", () => {
    const markup = renderToStaticMarkup(
      <Picker
        value="PURCHASE_INBOUND"
        onValueChange={() => undefined}
        options={options}
        aria-label="单据类型"
        data-testid="document-type"
      />,
    );

    expect(markup).toContain("采购入库");
    expect(markup).toContain('aria-label="单据类型"');
    expect(markup).toContain('data-testid="document-type"');
  });

  it("外部取值为空字符串且候选集里没有空字符串项时渲染占位文本", () => {
    const markup = renderToStaticMarkup(
      <Picker
        value=""
        onValueChange={() => undefined}
        options={options.filter((option) => option.value !== "")}
        placeholder="请选择单据类型"
      />,
    );

    expect(markup).toContain("请选择单据类型");
    expect(markup).not.toContain("全部");
  });

  it("候选集里有空字符串项且取值为空字符串时渲染该选项的文案", () => {
    const markup = renderToStaticMarkup(
      <Picker value="" onValueChange={() => undefined} options={options} placeholder="请选择" />,
    );

    expect(markup).toContain("全部");
    expect(markup).not.toContain("请选择");
  });
});
