import { createServerFn } from "@tanstack/react-start";
import { UnauthenticatedError } from "@/features/session/lib/errors";
import { fetchApi } from "@/lib/api-client";

export const DRAFT_DOCUMENT_TYPES = [
  "PURCHASE_INBOUND",
  "SALE_OUTBOUND",
  "SALE_RETURN",
  "PURCHASE_RETURN",
  "STOCKTAKE",
  "TRANSFER",
] as const;

export type DraftDocumentType = (typeof DRAFT_DOCUMENT_TYPES)[number];

export type DocumentStatus = "DRAFT" | "POSTED" | "VOIDED";

export type DocumentLine = {
  id: string;
  lineNo: number;
  itemId: string;
  quantity: string;
  unitPrice: string | null;
  amount: string | null;
  originalLineId: string | null;
};

export type Document = {
  id: string;
  documentNo: string;
  type: DraftDocumentType;
  status: DocumentStatus;
  supplierId: string | null;
  customerId: string | null;
  sourceWarehouseId: string | null;
  targetWarehouseId: string | null;
  warehouseId: string | null;
  lines: DocumentLine[];
};

export type DocumentLineInput = {
  itemId: string;
  quantity: string;
  unitPrice: string | null;
  amount: string | null;
  unit?: string | null;
  originalLineId?: string | null;
};

export type DocumentInput = {
  type: DraftDocumentType;
  supplierId: string | null;
  customerId: string | null;
  sourceWarehouseId: string | null;
  targetWarehouseId: string | null;
  warehouseId: string | null;
  lines: DocumentLineInput[];
};

export type DocumentFailure = { ok: false; code: string; message: string };

export type DocumentMutationResult = { ok: true; document: Document } | DocumentFailure;

export type DocumentDeleteResult = { ok: true } | DocumentFailure;

export type FormSubmitResult = { ok: true } | { ok: false; message: string };

export const listDocuments = createServerFn({ method: "GET" })
  .validator((data: { type: string; status: string }) => ({
    type: data.type,
    status: data.status,
  }))
  .handler(async ({ data }): Promise<Document[]> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const query = new URLSearchParams();
    if (data.type !== "") {
      query.set("type", data.type);
    }
    if (data.status !== "") {
      query.set("status", data.status);
    }
    const suffix = query.toString();
    const response = await fetchApi(
      `/api/documents${suffix === "" ? "" : `?${suffix}`}`,
      getRequestHeader("cookie"),
    );
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/documents 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: { documents: Document[] } };
    return payload.data.documents;
  });

export const getDocument = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => ({ id: data.id }))
  .handler(async ({ data }): Promise<Document> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(`/api/documents/${data.id}`, getRequestHeader("cookie"));
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/documents/${data.id} 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: Document };
    return payload.data;
  });

export const createDocument = createServerFn({ method: "POST" })
  .validator((data: DocumentInput) => data)
  .handler(async ({ data }): Promise<DocumentMutationResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi("/api/documents", getRequestHeader("cookie"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    return readMutationResult(response);
  });

export const updateDocument = createServerFn({ method: "POST" })
  .validator((data: { id: string; input: DocumentInput }) => data)
  .handler(async ({ data }): Promise<DocumentMutationResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(`/api/documents/${data.id}`, getRequestHeader("cookie"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data.input),
    });
    return readMutationResult(response);
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => ({ id: data.id }))
  .handler(async ({ data }): Promise<DocumentDeleteResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(`/api/documents/${data.id}`, getRequestHeader("cookie"), {
      method: "DELETE",
    });
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      const body = await readErrorBody(response);
      return { ok: false, code: body.code, message: body.message };
    }
    return { ok: true };
  });

export const postDocument = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => ({ id: data.id }))
  .handler(async ({ data }): Promise<DocumentMutationResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(`/api/documents/${data.id}/post`, getRequestHeader("cookie"), {
      method: "POST",
    });
    return readMutationResult(response);
  });

export const voidDocument = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => ({ id: data.id }))
  .handler(async ({ data }): Promise<DocumentMutationResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(`/api/documents/${data.id}/void`, getRequestHeader("cookie"), {
      method: "POST",
    });
    return readMutationResult(response);
  });

export async function toFormSubmitResult(
  run: () => Promise<DocumentMutationResult | DocumentDeleteResult>,
): Promise<FormSubmitResult> {
  try {
    const result = await run();
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "提交失败" };
  }
}

async function readMutationResult(response: Response): Promise<DocumentMutationResult> {
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    const body = await readErrorBody(response);
    return { ok: false, code: body.code, message: body.message };
  }
  const payload = (await response.json()) as { data: Document };
  return { ok: true, document: payload.data };
}

async function readErrorBody(response: Response): Promise<{ code: string; message: string }> {
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
