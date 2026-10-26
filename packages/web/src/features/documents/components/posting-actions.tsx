import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { postDocument, voidDocument } from "../lib/api";
import type { DocumentStatus } from "../lib/api";

export type PostingActionsProps = {
  documentId: string;
  documentNo: string;
  status: DocumentStatus;
};

type PostingAction = "POST" | "VOID";

const ACTION_LABELS: Record<PostingAction, string> = {
  POST: "过账",
  VOID: "作废",
};

export function PostingActions({ documentId, documentNo, status }: PostingActionsProps) {
  const [confirming, setConfirming] = useState<PostingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (action: PostingAction) =>
      action === "POST"
        ? postDocument({ data: { id: documentId } })
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

  const ask = (action: PostingAction): void => {
    setError(null);
    setConfirming(action);
  };

  return (
    <div className="flex flex-col gap-1" data-testid="posting-actions">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="document-post"
          disabled={status !== "DRAFT" || mutation.isPending}
          onClick={() => ask("POST")}
        >
          过账
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          data-testid="document-void"
          disabled={status !== "POSTED" || mutation.isPending}
          onClick={() => ask("VOID")}
        >
          作废
        </Button>
      </div>
      {confirming === null ? null : (
        <div className="flex items-center gap-2" data-testid="posting-confirm">
          <span className="text-xs">
            确认{ACTION_LABELS[confirming]} {documentNo}？
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
