import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [".scratch/**"],
  },
  lint: {
    ignorePatterns: [".scratch/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
