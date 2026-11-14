import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  server: { host: "::", port: 8080, allowedHosts: [".trycloudflare.com"] },
  resolve: { tsconfigPaths: true, dedupe: ["react", "react-dom"] },
  plugins: [
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    ...(command === "build" ? [nitro({ preset: "node" })] : []),
    react(),
  ],
}));
