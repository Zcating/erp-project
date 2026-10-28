export async function readErrorBody(
  response: Response,
): Promise<{ code: string; message: string }> {
  try {
    const payload = (await response.json()) as { error?: { code?: string; message?: string } };
    return {
      code: payload.error?.code ?? "INTERNAL",
      message: payload.error?.message ?? `请求失败（${response.status}）`,
    };
  } catch {
    return { code: "INTERNAL", message: `请求失败（${response.status}）` };
  }
}
