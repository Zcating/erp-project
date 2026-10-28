export type FormSubmitResult = { ok: true } | { ok: false; message: string };

export async function toFormSubmitResult(
  run: () => Promise<FormSubmitResult>,
): Promise<FormSubmitResult> {
  try {
    const result = await run();
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "提交失败" };
  }
}
