export type AdminCredentials = {
  username: string;
  password: string;
};

export type AdminEnvName = "ADMIN_USERNAME" | "ADMIN_PASSWORD";

export type ResolvedAdminCredentials = {
  credentials: AdminCredentials;
  isDefault: boolean;
  missing: Array<AdminEnvName>;
};

export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin-dev-password";

export function resolveAdminCredentials(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedAdminCredentials {
  const username = env.ADMIN_USERNAME?.trim() ?? "";
  const password = env.ADMIN_PASSWORD ?? "";
  const missing: Array<AdminEnvName> = [];
  if (username === "") {
    missing.push("ADMIN_USERNAME");
  }
  if (password === "") {
    missing.push("ADMIN_PASSWORD");
  }
  if (missing.length === 0) {
    return { credentials: { username, password }, isDefault: false, missing };
  }
  return {
    credentials: { username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD },
    isDefault: true,
    missing,
  };
}
