/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    mainFields: ["main", "module"],
    conditions: ["node", "import", "module", "default"],
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/__tests__/setupEnv.ts"],
    include: ["src/__tests__/**/*.test.ts"],
    server: {
      deps: {
        external: ["ioredis-mock"],
      },
    },
  },
});
