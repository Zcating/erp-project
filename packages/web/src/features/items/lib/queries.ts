import { queryOptions } from "@tanstack/react-query";
import { getItem, listItems } from "@/server";

export function itemListQueryKey() {
  return ["items", "list"] as const;
}

export function itemListQueryOptions() {
  return queryOptions({
    queryKey: itemListQueryKey(),
    queryFn: () => listItems(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function itemDetailQueryKey(id: string) {
  return ["items", "detail", id] as const;
}

export function itemDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: itemDetailQueryKey(id),
    queryFn: () => getItem({ data: { id } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
