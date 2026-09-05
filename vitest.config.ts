import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Mirrors the `@/*` path alias from tsconfig.json. Next resolves it via the
 * TypeScript config; Vitest needs it declared here or any test importing a
 * module that uses `@/` fails to resolve.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
