import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { documentDetailQueryOptions, DocumentForm } from "@/features/documents";
import { updateDocument, type DocumentInput } from "@/server";
import { toFormSubmitResult } from "@/shared/form";

export const Route = createFileRoute("/documents/$documentId/edit")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(documentDetailQueryOptions(params.documentId));
  },
  component: EditDocumentPage,
});

function EditDocumentPage() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: document, isPending } = useQuery(documentDetailQueryOptions(documentId));
  const mutation = useMutation({
    mutationFn: (input: DocumentInput) => updateDocument({ data: { id: documentId, input } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await queryClient.invalidateQueries({ queryKey: ["documents", "detail", documentId] });
      void navigate({ to: "/documents" });
    },
  });

  if (isPending || document === undefined) {
    return (
      <AdminShell>
        <p className="text-sm text-muted-foreground">加载中…</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold">编辑单据草稿：{document.documentNo}</h1>
      <DocumentForm
        key={document.id}
        documentType={document.type}
        initialDocument={document}
        submitLabel="保存修改"
        onSubmit={(input) => toFormSubmitResult(() => mutation.mutateAsync(input))}
      />
    </AdminShell>
  );
}
