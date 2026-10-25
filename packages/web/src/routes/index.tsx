import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <AdminShell>
      <h1 className="mb-2 text-2xl font-semibold">总览</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        前端脚手架已就绪：浏览器只与本应用同源交互，业务数据经服务端代理到 Fastify API。
      </p>
      <div className="flex gap-3">
        <Button>新建单据</Button>
        <Button variant="outline">刷新</Button>
      </div>
    </AdminShell>
  );
}
