import { createServerFn } from "@tanstack/react-start";

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
    const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
    const response = await fetch(`${apiBaseUrl}/api/system/routes`);
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
