import type { KernelErrorCode } from "../../shared/errors";
import { KernelError } from "../../shared/errors";

export type ItemBatchErrorDetail = {
  line: number;
  code: KernelErrorCode;
  message: string;
};

export class ItemBatchError extends KernelError {
  readonly details: ItemBatchErrorDetail[];

  constructor(
    message: string,
    details: ItemBatchErrorDetail[],
    code: KernelErrorCode = "VALIDATION",
  ) {
    super(code, message);
    this.details = details;
  }
}

export function itemBatchErrorFromDetails(details: ItemBatchErrorDetail[]): ItemBatchError {
  const codes = new Set(details.map((detail) => detail.code));
  const firstCode = details[0]?.code;
  const code: KernelErrorCode =
    codes.size === 1 && firstCode !== undefined ? firstCode : "VALIDATION";
  const message =
    code === "DUPLICATE"
      ? `导入失败：${details.length} 行商品编码或条码已存在`
      : `导入失败：${details.length} 行数据不合法`;
  return new ItemBatchError(message, details, code);
}
