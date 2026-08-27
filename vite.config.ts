import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The app source lives in `app/`, but the production build is emitted to the
 * repository root as `index.html` + `assets/`. That is deliberate: GitHub Pages
 * on this repo serves the default branch's root directory, so emitting there
 * keeps the published site working without anyone having to change a setting.
 *
 * `base: "./"` makes every asset URL relative, so the same build works at
 * `user.github.io/gpadashboard/`, at a custom domain root, and from `file://`.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./app", import.meta.url)),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./app/src", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL(".", import.meta.url)),
    assetsDir: "assets",
    emptyOutDir: false, // the repo root holds source too — never wipe it
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
