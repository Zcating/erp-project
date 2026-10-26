import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      ".scratch/**",
      "**/routeTree.gen.ts",
      "**/drizzle/meta/**",
    ],
  },
  lint: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      ".scratch/**",
      "**/routeTree.gen.ts",
      "**/drizzle/meta/**",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
  },
});
