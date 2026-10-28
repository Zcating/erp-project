import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAdmin } from "@/server";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { next: string } => ({
    next: typeof search.next === "string" && search.next.startsWith("/") ? search.next : "/",
  }),
  component: LoginPage,
});

function LoginPage() {
  const { next } = Route.useSearch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const outcome = await loginAdmin({ data: { username, password } });
    setPending(false);
    if (!outcome.ok) {
      setError("账号或密码不正确");
      return;
    }
    window.location.assign(next);
  };

  return (
    <main
      data-testid="login-main"
      className="flex min-h-screen items-center justify-center bg-background p-6"
    >
      <form
        data-testid="login-form"
        className="w-full max-w-sm rounded-lg border border-border p-6"
        onSubmit={onSubmit}
      >
        <h1 className="mb-4 text-xl font-semibold">登录进销存管理后台</h1>

        <div className="mb-3">
          <Label htmlFor="login-username" className="block text-sm">
            账号
          </Label>
          <Input
            id="login-username"
            data-testid="login-username"
            className="mt-1 w-full"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="mb-4">
          <Label htmlFor="login-password" className="block text-sm">
            密码
          </Label>
          <Input
            id="login-password"
            data-testid="login-password"
            type="password"
            className="mt-1 w-full"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error === null ? null : (
          <p data-testid="login-error" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" data-testid="login-submit" disabled={pending}>
          登录
        </Button>
      </form>
    </main>
  );
}
