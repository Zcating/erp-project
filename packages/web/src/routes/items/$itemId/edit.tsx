import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { itemDetailQueryOptions, ItemForm, itemListQueryKey } from "@/features/items";
import { updateItem } from "@/server";
import { toFormSubmitResult } from "@/shared/form";

export const Route = createFileRoute("/items/$itemId/edit")({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(itemDetailQueryOptions(params.itemId));
  },
  component: EditItemPage,
});

function EditItemPage() {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: item, isPending } = useQuery(itemDetailQueryOptions(itemId));
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof updateItem>[0]["data"]["input"]) =>
      updateItem({ data: { id: itemId, input } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: itemListQueryKey() });
      await queryClient.invalidateQueries({ queryKey: ["items", "detail", itemId] });
      void navigate({ to: "/items" });
    },
  });

  if (isPending || item === undefined) {
    return (
      <AdminShell>
        <p className="text-sm text-muted-foreground">加载中…</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold">编辑商品档案</h1>
      <ItemForm
        key={item.id}
        initialItem={item}
        submitLabel="保存修改"
        onSubmit={(input) => toFormSubmitResult(() => mutation.mutateAsync(input))}
      />
    </AdminShell>
  );
}
