import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { isUnauthenticatedError, LOGIN_PATH } from "@/features/session";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
  const sessionExpired: { handle: () => void } = { handle: () => undefined };

  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!isUnauthenticatedError(error)) {
          return;
        }
        if (query.queryKey[0] === "session") {
          return;
        }
        sessionExpired.handle();
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
      },
    },
  });

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
  });

  sessionExpired.handle = () => {
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "session" });
    void router.navigate({ to: LOGIN_PATH, search: { next: currentLocationHref() } });
  };

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

function currentLocationHref(): string {
  if (typeof window === "undefined") {
    return "/";
  }
  return `${window.location.pathname}${window.location.search}`;
}

export function getRouter() {
  return createRouter();
}
