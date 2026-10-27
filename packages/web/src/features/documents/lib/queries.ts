import { queryOptions } from "@tanstack/react-query";
import { getDocument, listDocuments, listOriginalCandidates } from "./api";

export function documentListQueryKey(type: string, status: string) {
  return ["documents", "list", type, status] as const;
}

export function documentListQueryOptions(type: string, status: string) {
  return queryOptions({
    queryKey: documentListQueryKey(type, status),
    queryFn: () => listDocuments({ data: { type, status } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function documentDetailQueryKey(id: string) {
  return ["documents", "detail", id] as const;
}

export function documentDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: documentDetailQueryKey(id),
    queryFn: () => getDocument({ data: { id } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function originalCandidateQueryKey(type: string) {
  return ["documents", "original-candidates", type] as const;
}

export function originalCandidateQueryOptions(type: string) {
  return queryOptions({
    queryKey: originalCandidateQueryKey(type),
    queryFn: () => listOriginalCandidates({ data: { type } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
