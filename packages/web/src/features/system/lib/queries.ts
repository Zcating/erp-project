import { queryOptions } from "@tanstack/react-query";
import { listSystemRoutes } from "./api";

export function systemRoutesQueryKey(filter: string) {
  return ["system", "routes", filter] as const;
}

export function systemRoutesQueryOptions(filter: string) {
  return queryOptions({
    queryKey: systemRoutesQueryKey(filter),
    queryFn: () => listSystemRoutes({ data: { filter } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
