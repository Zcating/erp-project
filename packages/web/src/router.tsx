import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
  const queryClient = new QueryClient({
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

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

export function getRouter() {
  return createRouter();
}
