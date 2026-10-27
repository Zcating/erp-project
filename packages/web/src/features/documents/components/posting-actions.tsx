import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { postDocument, voidDocument } from "../lib/api";
import type { AvailableDocumentActions } from "../lib/api";

export type PostingActionsProps = {
  documentId: string;
  documentNo: string;
  actions: AvailableDocumentActions;
};

type PendingAction = { kind: "POST"; phase: string | undefined; label: string } | { kind: "VOID" };

export function postingActionTestId(phase: string | null): string {
  return phase === null ? "document-post" : `document-post-${phase.toLowerCase()}`;
}

export function PostingActions({ documentId, documentNo, actions }: PostingActionsProps) {
  const [confirming, setConfirming] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (action: PendingAction) =>
      action.kind === "POST"
        ? postDocument({ data: { id: documentId, phase: action.phase } })
        : voidDocument({ data: { id: documentId } }),
    onSuccess: async (result) => {
      setConfirming(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const ask = (action: PendingAction): void => {
    setError(null);
    setConfirming(action);
  };

  const labelOf = (action: PendingAction): string =>
    action.kind === "POST" ? action.label : actions.void.label;

  return (
    <div className="flex flex-col gap-1" data-testid="posting-actions">
      <div className="flex gap-2">
        {actions.post.map((action) => (
          <Button
            key={postingActionTestId(action.phase)}
            type="button"
            variant="outline"
            size="sm"
            data-testid={postingActionTestId(action.phase)}
            disabled={!action.enabled || mutation.isPending}
            onClick={() =>
              ask({ kind: "POST", phase: action.phase ?? undefined, label: action.label })
            }
          >
            {action.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          data-testid="document-void"
          disabled={!actions.void.enabled || mutation.isPending}
          onClick={() => ask({ kind: "VOID" })}
        >
          {actions.void.label}
        </Button>
      </div>
      {confirming === null ? null : (
        <div className="flex items-center gap-2" data-testid="posting-confirm">
          <span className="text-xs">
            确认{labelOf(confirming)} {documentNo}？
          </span>
          <Button
            type="button"
            size="xs"
            data-testid="posting-confirm-accept"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(confirming)}
          >
            确认
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            data-testid="posting-cancel"
            onClick={() => setConfirming(null)}
          >
            取消
          </Button>
        </div>
      )}
      {error === null ? null : (
        <p className="text-xs text-destructive" data-testid="posting-error">
          {error}
        </p>
      )}
    </div>
  );
}
