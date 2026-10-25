import { useQueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { createStore, Provider } from "jotai";
import { useEffect, useState } from "react";
import { uiStateAtoms } from "@/features/system/stores";
import { installDebugHandles, readAtomValues, readQueryCache } from "@/lib/debug-handles";
import type { WebRouterContext } from "@/router-context";
import "../styles.css";

export const Route = createRootRouteWithContext<WebRouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  const [store] = useState(() => createStore());
  const queryClient = useQueryClient();

  useEffect(() => {
    installDebugHandles({
      readUiState: () => readAtomValues(store, uiStateAtoms),
      readQueryCache: () => readQueryCache(queryClient),
    });
  }, [store, queryClient]);

  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <Provider store={store}>
          <Outlet />
        </Provider>
        <Scripts />
      </body>
    </html>
  );
}
