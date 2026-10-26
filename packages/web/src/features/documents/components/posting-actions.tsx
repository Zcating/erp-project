import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { postDocument, voidDocument } from "../lib/api";
import type { DocumentStatus } from "../lib/api";

export type PostingActionOption = {
  phase?: string;
  label: string;
  disabled: boolean;
  testId: string;
};

export type PostingActionsProps = {
  documentId: string;
  documentNo: string;
  status: DocumentStatus;
  postActions?: PostingActionOption[] | undefined;
};

type PendingAction = { kind: "POST"; phase: string | undefined; label: string } | { kind: "VOID" };

const VOID_LABEL = "作废";

export function PostingActions({
  documentId,
  documentNo,
  status,
  postActions,
}: PostingActionsProps) {
  const [confirming, setConfirming] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const options: PostingActionOption[] = postActions ?? [
    { label: "过账", disabled: status !== "DRAFT", testId: "document-post" },
  ];

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
    action.kind === "POST" ? action.label : VOID_LABEL;

  return (
    <div className="flex flex-col gap-1" data-testid="posting-actions">
      <div className="flex gap-2">
        {options.map((option) => (
          <Button
            key={option.testId}
            type="button"
            variant="outline"
            size="sm"
            data-testid={option.testId}
            disabled={option.disabled || mutation.isPending}
            onClick={() => ask({ kind: "POST", phase: option.phase, label: option.label })}
          >
            {option.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          data-testid="document-void"
          disabled={status !== "POSTED" || mutation.isPending}
          onClick={() => ask({ kind: "VOID" })}
        >
          {VOID_LABEL}
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
