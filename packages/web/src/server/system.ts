import { createServerFn } from "@tanstack/react-start";
import { fetchApi } from "./client";
import { UnauthenticatedError } from "./errors";

export type SystemRouteEntry = {
  method: string;
  url: string;
};

export type SystemRouteList = {
  routes: SystemRouteEntry[];
};

export const listSystemRoutes = createServerFn({ method: "GET" })
  .validator((data: { filter: string }) => ({ filter: data.filter }))
  .handler(async ({ data }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi("/api/system/routes", getRequestHeader("cookie"));
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/system/routes 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: SystemRouteList };
    const filter = data.filter.trim();
    return {
      routes: payload.data.routes.filter(
        (route) =>
          filter === "" ||
          route.url.includes(filter) ||
          route.method.toLowerCase().includes(filter.toLowerCase()),
      ),
    };
  });
