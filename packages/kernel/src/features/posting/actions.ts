import {
  DOCUMENT_STATUS_LABELS,
  POSTED_DOCUMENT_STATUS,
  VOIDED_DOCUMENT_STATUS,
  canTransitionDocumentStatus,
} from "../documents";
import type { Document } from "../documents";
import { POSTING_PHASES } from "./model";
import type { PostingPhase } from "./model";
import { POSTING_PHASE_SEQUENCES } from "./phases";

export type AvailablePostingAction = {
  phase: PostingPhase | null;
  label: string;
  enabled: boolean;
  reason: string | null;
};

export type AvailableDocumentActions = {
  post: AvailablePostingAction[];
  void: { label: string; enabled: boolean; reason: string | null };
};

const POST_ACTION_LABELS: Record<PostingPhase, string> = {
  DEFAULT: "过账",
  OUT: "调出过账",
  IN: "调入过账",
};

const PHASE_NAMES: Record<PostingPhase, string> = {
  DEFAULT: "过账",
  OUT: "调出",
  IN: "调入",
};

const VOID_LABEL = "作废";
const POSTED_LABEL = DOCUMENT_STATUS_LABELS[POSTED_DOCUMENT_STATUS];
const VOIDED_LABEL = DOCUMENT_STATUS_LABELS[VOIDED_DOCUMENT_STATUS];

export function availableDocumentActions(
  document: Document,
  postedPhases: readonly string[],
): AvailableDocumentActions {
  const phases = POSTING_PHASE_SEQUENCES[document.type];
  const canPost = canTransitionDocumentStatus(document.status, POSTED_DOCUMENT_STATUS);
  const canVoid = canTransitionDocumentStatus(document.status, VOIDED_DOCUMENT_STATUS);
  const voided = !canPost && !canVoid;

  const post: AvailablePostingAction[] =
    phases.length === 1
      ? [singlePostAction(canPost, voided)]
      : phases.map((phase, index) => {
          const label = POST_ACTION_LABELS[phase];
          const done = postedPhases.includes(phase);
          const missing = phases
            .slice(0, index)
            .find((previous) => !postedPhases.includes(previous));
          const enabled = (index === 0 ? canPost : canVoid) && missing === undefined && !done;
          return {
            phase,
            label,
            enabled,
            reason: enabled ? null : phaseReason(phase, label, done, missing, voided),
          };
        });

  return {
    post,
    void: voidAction(canVoid, voided),
  };
}

function singlePostAction(canPost: boolean, voided: boolean): AvailablePostingAction {
  let reason: string | null = null;
  if (!canPost) {
    reason = voided ? `单据${VOIDED_LABEL}，不能过账` : `单据${POSTED_LABEL}，不能再次过账`;
  }
  return {
    phase: null,
    label: POST_ACTION_LABELS[POSTING_PHASES.DEFAULT],
    enabled: canPost,
    reason,
  };
}

function voidAction(canVoid: boolean, voided: boolean): AvailableDocumentActions["void"] {
  let reason: string | null = null;
  if (!canVoid) {
    reason = voided ? `单据${VOIDED_LABEL}，不能再次作废` : "单据尚未过账，不能作废";
  }
  return { label: VOID_LABEL, enabled: canVoid, reason };
}

function phaseReason(
  phase: PostingPhase,
  label: string,
  done: boolean,
  missing: PostingPhase | undefined,
  voided: boolean,
): string {
  if (voided) {
    return `单据${VOIDED_LABEL}，不能${label}`;
  }
  if (done) {
    return `${PHASE_NAMES[phase]}阶段已完成`;
  }
  if (missing !== undefined) {
    return `${PHASE_NAMES[missing]}阶段尚未完成，不能${label}`;
  }
  return `单据${POSTED_LABEL}，不能${label}`;
}
