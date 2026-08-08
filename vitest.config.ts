import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    // `output: "standalone"` copies the whole project into .next/standalone,
    // so without this the suite runs twice and tries to execute the Playwright
    // specs under vitest.
    exclude: ["e2e/**", "node_modules/**", ".next/**", "dist/**"],

    execArgv: ["--no-warnings"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
