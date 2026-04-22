import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import path from "path";

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.resolve(root, "../package.json"), "utf-8"));

export default defineConfig({
  site: "https://stack.ldlework.com",
  output: "static",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        "@app": path.resolve(root, "../src"),
      },
    },
  },
});
