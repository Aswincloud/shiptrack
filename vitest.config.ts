import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Parser tests run in plain Node (no Workers runtime needed): each carrier's
// network call is stubbed with a saved fixture, so nothing here touches D1,
// bindings or the real couriers. See tests/README.md.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
