import { queryOptions } from "@tanstack/react-query";
import { readSession } from "./api";

export function sessionQueryKey() {
  return ["session", "current"] as const;
}

export function sessionQueryOptions() {
  return queryOptions({
    queryKey: sessionQueryKey(),
    queryFn: () => readSession(),
    staleTime: 0,
  });
}
