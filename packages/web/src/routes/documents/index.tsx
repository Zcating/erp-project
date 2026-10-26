import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { AdminShell } from "@/components/admin-shell";
import {
  deleteDocument,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_TYPE_LABELS,
  DRAFT_DOCUMENT_TYPES,
  documentListQueryOptions,
  documentStatusFilterAtom,
  documentTypeFilterAtom,
  PostingActions,
  TRANSFER_POSTING_PHASES,
} from "@/features/documents";
import type { Document } from "@/features/documents";

export const Route = createFileRoute("/documents/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(documentListQueryOptions("", ""));
  },
  component: DocumentListPage,
});

function DocumentListPage() {
  const [typeFilter, setTypeFilter] = useAtom(documentTypeFilterAtom);
  const [statusFilter, setStatusFilter] = useAtom(documentStatusFilterAtom);
  const queryClient = useQueryClient();
  const { data: documents, isPending } = useQuery(
    documentListQueryOptions(typeFilter, statusFilter),
  );

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteDocument({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const postActionsOf = (document: Document) => {
    if (document.type !== "TRANSFER") {
      return undefined;
    }
    const postedPhases = document.postedPhases ?? [];
    const outDone = postedPhases.includes(TRANSFER_POSTING_PHASES.OUT);
    const inDone = postedPhases.includes(TRANSFER_POSTING_PHASES.IN);
    return [
      {
        phase: TRANSFER_POSTING_PHASES.OUT,
        label: "调出过账",
        disabled: document.status !== "DRAFT" || outDone,
        testId: "document-post-out",
      },
      {
        phase: TRANSFER_POSTING_PHASES.IN,
        label: "调入过账",
        disabled: document.status !== "POSTED" || !outDone || inDone,
        testId: "document-post-in",
      },
    ];
  };

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">单据</h1>
        <Link
          to="/documents/new"
          data-testid="document-create-link"
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          新建单据
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="block text-sm" htmlFor="document-type-filter">
          单据类型
          <select
            id="document-type-filter"
            data-testid="document-type-filter"
            className="mt-1 block w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="">全部类型</option>
            {DRAFT_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm" htmlFor="document-status-filter">
          单据状态
          <select
            id="document-status-filter"
            data-testid="document-status-filter"
            className="mt-1 block w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">全部状态</option>
            {DOCUMENT_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {DOCUMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table className="w-full border-collapse text-sm" data-testid="document-table">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4">单号</th>
            <th className="py-2 pr-4">单据类型</th>
            <th className="py-2 pr-4">状态</th>
            <th className="py-2 pr-4">单据行金额</th>
            <th className="py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {(documents ?? []).map((document) => (
            <tr key={document.id} data-testid="document-row" className="border-b border-border/60">
              <td className="py-2 pr-4 font-mono" data-testid="document-no">
                {document.documentNo}
              </td>
              <td className="py-2 pr-4" data-testid="document-type">
                {DOCUMENT_TYPE_LABELS[document.type]}
              </td>
              <td className="py-2 pr-4" data-testid="document-status">
                {DOCUMENT_STATUS_LABELS[document.status]}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="document-amounts">
                {document.lines.length === 0
                  ? "—"
                  : document.lines.map((line) => line.amount ?? "—").join("、")}
              </td>
              <td className="py-2">
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Link
                      to="/documents/$documentId/edit"
                      params={{ documentId: document.id }}
                      data-testid="document-edit"
                      className="rounded-md px-2 py-1 hover:bg-muted"
                    >
                      编辑
                    </Link>
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-destructive hover:bg-muted"
                      data-testid="document-delete"
                      onClick={() => removeMutation.mutate(document.id)}
                    >
                      删除
                    </button>
                  </div>
                  <PostingActions
                    documentId={document.id}
                    documentNo={document.documentNo}
                    status={document.status}
                    postActions={postActionsOf(document)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isPending ? <p className="mt-4 text-sm text-muted-foreground">加载中…</p> : null}

      {(documents ?? []).length === 0 && !isPending ? (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="document-empty">
          没有匹配的单据
        </p>
      ) : null}
    </AdminShell>
  );
}
