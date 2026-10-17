import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// 不支持浏览器跨域的模型服务走同源代理，与 vercel.json 的 routes、src/services/corsProxy.ts 保持一致。
// 转发时换掉浏览器 User-Agent：v2ex 的 Cloudflare 对「浏览器 UA + 非浏览器 TLS」返回人机验证页（403）
const llmProxy = {
  "/llm-proxy/v2ex/chat/v1": {
    target: "https://edge.v2ex.com",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/llm-proxy\/v2ex/, ""),
    headers: { "user-agent": "NovelCraft-LLM-Proxy" },
  },
};

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    proxy: llmProxy,
  },
  preview: {
    proxy: llmProxy,
  },
}));
