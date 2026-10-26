import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import {
  createDocument,
  DocumentForm,
  toFormSubmitResult,
  type DocumentInput,
  type DraftDocumentType,
} from "@/features/documents";

export const Route = createFileRoute("/documents/new")({
  component: NewDocumentPage,
});

function NewDocumentPage() {
  const [documentType, setDocumentType] = useState<DraftDocumentType>("PURCHASE_INBOUND");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: DocumentInput) => createDocument({ data: input }),
    onSuccess: async (result) => {
      if (!result.ok) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      void navigate({ to: "/documents" });
    },
  });

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold">新建单据草稿</h1>
      <DocumentForm
        documentType={documentType}
        onDocumentTypeChange={setDocumentType}
        submitLabel="保存草稿"
        onSubmit={(input) => toFormSubmitResult(() => mutation.mutateAsync(input))}
      />
    </AdminShell>
  );
}
