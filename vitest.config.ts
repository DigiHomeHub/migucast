import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/smoke/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/types/**",
        "src/scripts/**",
        "src/platform/types.ts",
        "src/api/index.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 70,
        lines: 80,
      },
    },
  },
});
