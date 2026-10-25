import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      ".scratch/**",
      "**/routeTree.gen.ts",
      "**/drizzle/**",
    ],
  },
  lint: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      ".scratch/**",
      "**/routeTree.gen.ts",
      "**/drizzle/**",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
