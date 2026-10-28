import { createServerFn } from "@tanstack/react-start";
import { fetchApi } from "./client";
import { UnauthenticatedError } from "./errors";
import { readErrorBody } from "./http";

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

export type AvailablePostingAction = {
  phase: string | null;
  label: string;
  enabled: boolean;
  reason: string | null;
};

export type AvailableDocumentActions = {
  post: AvailablePostingAction[];
  void: { label: string; enabled: boolean; reason: string | null };
};

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

export type DocumentWithActions = Document & {
  actions: AvailableDocumentActions;
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

export const listDocuments = createServerFn({ method: "GET" })
  .validator((data: { type: string; status: string }) => ({
    type: data.type,
    status: data.status,
  }))
  .handler(async ({ data }): Promise<DocumentWithActions[]> => {
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
    const payload = (await response.json()) as { data: { documents: DocumentWithActions[] } };
    return payload.data.documents;
  });

export const listOriginalCandidates = createServerFn({ method: "GET" })
  .validator((data: { type: string }) => ({ type: data.type }))
  .handler(async ({ data }): Promise<DocumentWithActions[]> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(
      `/api/documents/original-candidates?type=${encodeURIComponent(data.type)}`,
      getRequestHeader("cookie"),
    );
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/documents/original-candidates 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: { documents: DocumentWithActions[] } };
    return payload.data.documents;
  });

export const getDocument = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => ({ id: data.id }))
  .handler(async ({ data }): Promise<DocumentWithActions> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(`/api/documents/${data.id}`, getRequestHeader("cookie"));
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/documents/${data.id} 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: DocumentWithActions };
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
  .validator((data: { id: string; phase?: string | undefined }) => ({
    id: data.id,
    phase: data.phase,
  }))
  .handler(async ({ data }): Promise<DocumentMutationResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(`/api/documents/${data.id}/post`, getRequestHeader("cookie"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data.phase === undefined ? {} : { phase: data.phase }),
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
