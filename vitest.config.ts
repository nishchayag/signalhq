import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // Real Mongo ops under mongodb-memory-server (plus a first-run mongod
    // binary download) can exceed the defaults on a cold machine.
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
