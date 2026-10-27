import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { AdminShell } from "@/components/admin-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import {
  deleteDocument,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  documentListQueryOptions,
  documentStatusFilterAtom,
  documentStatusFilterOptions,
  documentTypeFilterAtom,
  documentTypeFilterOptions,
  DRAFT_DOCUMENT_TYPES,
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
        <div>
          <Label
            id="document-type-filter-label"
            htmlFor="document-type-filter"
            className="block text-sm"
          >
            单据类型
          </Label>
          <Picker
            id="document-type-filter"
            className="mt-1 w-48"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={documentTypeFilterOptions(DRAFT_DOCUMENT_TYPES)}
            data-testid="document-type-filter"
            aria-labelledby="document-type-filter-label"
          />
        </div>
        <div>
          <Label
            id="document-status-filter-label"
            htmlFor="document-status-filter"
            className="block text-sm"
          >
            单据状态
          </Label>
          <Picker
            id="document-status-filter"
            className="mt-1 w-48"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={documentStatusFilterOptions()}
            data-testid="document-status-filter"
            aria-labelledby="document-status-filter-label"
          />
        </div>
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
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      编辑
                    </Link>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      data-testid="document-delete"
                      onClick={() => removeMutation.mutate(document.id)}
                    >
                      删除
                    </Button>
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
