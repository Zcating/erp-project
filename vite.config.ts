import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: ["**/node_modules/**", "**/dist/**", ".scratch/**", "**/routeTree.gen.ts"],
  },
  lint: {
    ignorePatterns: ["**/node_modules/**", "**/dist/**", ".scratch/**", "**/routeTree.gen.ts"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
