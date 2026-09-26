import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirror the tsconfig `@/*` path alias so tests can import app modules the same way the app does.
export default defineConfig({
  // tsconfig keeps JSX as-is for Next; tests compile it with the automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
