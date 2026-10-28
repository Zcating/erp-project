import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { ItemForm, itemListQueryKey } from "@/features/items";
import { createItem } from "@/server";
import { toFormSubmitResult } from "@/shared/form";

export const Route = createFileRoute("/items/new")({
  component: NewItemPage,
});

function NewItemPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof createItem>[0]["data"]) => createItem({ data: input }),
    onSuccess: async (result) => {
      if (!result.ok) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: itemListQueryKey() });
      void navigate({ to: "/items" });
    },
  });

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold">新建商品档案</h1>
      <ItemForm
        submitLabel="保存"
        onSubmit={(input) => toFormSubmitResult(() => mutation.mutateAsync(input))}
      />
    </AdminShell>
  );
}
