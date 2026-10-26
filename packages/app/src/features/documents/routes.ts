import type {
  Document,
  DocumentFilter,
  DocumentInput,
  DocumentService,
} from "@erp-inventory-sales/kernel";
import type { PostingService, TransferQueryService } from "@erp-inventory-sales/kernel";
import { ValidationError, isDocumentStatus, isDocumentType } from "@erp-inventory-sales/kernel";
import type { FastifyInstance } from "fastify";
import { success } from "../../shared/envelope";
import { documentBodySchema, postingBodySchema, type DocumentBody } from "./schema";

export type DocumentWithPhases = Document & { postedPhases?: string[] };

export type DocumentRouteDeps = {
  service: DocumentService;
  postingService: PostingService;
  transferService: TransferQueryService;
};

export function registerDocumentRoutes(app: FastifyInstance, deps: DocumentRouteDeps): void {
  const withPostedPhases = async (documents: Document[]): Promise<DocumentWithPhases[]> => {
    const phases = await deps.transferService.listPostedPhasesOf(documents);
    return documents.map((document) => {
      const postedPhases = phases.get(document.id);
      return postedPhases === undefined ? document : { ...document, postedPhases };
    });
  };

  app.post("/api/documents", async (request) => {
    const body = documentBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError("请求体必须是单据对象");
    }
    return success(await deps.service.create(toDocumentInput(body.data)));
  });

  app.get("/api/documents", async (request) => {
    const query = request.query as { type?: string; status?: string };
    const documents = await deps.service.list(toDocumentFilter(query));
    return success({ documents: await withPostedPhases(documents) });
  });

  app.get("/api/documents/:id", async (request) => {
    const params = request.params as { id: string };
    const document = await deps.service.get(params.id);
    const [view] = await withPostedPhases([document]);
    return success(view);
  });

  app.get("/api/documents/:id/in-transit", async (request) => {
    const params = request.params as { id: string };
    const records = await deps.transferService.listInTransit(params.id);
    return success({ inTransit: records });
  });

  app.put("/api/documents/:id", async (request) => {
    const params = request.params as { id: string };
    const body = documentBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError("请求体必须是单据对象");
    }
    return success(await deps.service.update(params.id, toDocumentInput(body.data)));
  });

  app.delete("/api/documents/:id", async (request) => {
    const params = request.params as { id: string };
    await deps.service.remove(params.id);
    return success({ id: params.id });
  });

  app.post("/api/documents/:id/post", async (request) => {
    const params = request.params as { id: string };
    const body = postingBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      throw new ValidationError("请求体必须是过账阶段对象");
    }
    const phase = body.data.phase ?? undefined;
    return success(await deps.postingService.post(params.id, undefined, phase));
  });

  app.post("/api/documents/:id/void", async (request) => {
    const params = request.params as { id: string };
    return success(await deps.postingService.void(params.id));
  });
}

function toDocumentInput(body: DocumentBody): DocumentInput {
  const type = (body.type ?? "").trim();
  if (type === "") {
    throw new ValidationError("缺少单据类型");
  }
  if (!isDocumentType(type)) {
    throw new ValidationError(`未知单据类型：${type}`);
  }
  return {
    type,
    supplierId: body.supplierId ?? null,
    customerId: body.customerId ?? null,
    sourceWarehouseId: body.sourceWarehouseId ?? null,
    targetWarehouseId: body.targetWarehouseId ?? null,
    warehouseId: body.warehouseId ?? null,
    lines: (body.lines ?? []).map((line) => ({
      itemId: line.itemId ?? "",
      quantity: line.quantity ?? "",
      unitPrice: line.unitPrice ?? null,
      amount: line.amount ?? null,
      unit: line.unit ?? null,
      originalLineId: line.originalLineId ?? null,
    })),
  };
}

function toDocumentFilter(query: { type?: string; status?: string }): DocumentFilter {
  const type = (query.type ?? "").trim();
  const status = (query.status ?? "").trim();
  if (type !== "" && !isDocumentType(type)) {
    throw new ValidationError(`未知单据类型：${type}`);
  }
  if (status !== "" && !isDocumentStatus(status)) {
    throw new ValidationError(`未知单据状态：${status}`);
  }
  return {
    type: type === "" ? null : type,
    status: status === "" ? null : status,
  };
}
