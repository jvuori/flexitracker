import { defineConfig } from "vitest/config";

// Plain vitest for pure-logic unit tests (schema validation, worktime rules).
// DO/Worker integration tests use the Workers vitest pool, added with the
// tenant-storage tasks.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
