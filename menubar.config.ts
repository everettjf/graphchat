import { defineConfig } from "./packages/bun-menubar/src/config.js";

// `bun run app:build` → dist-app/Pi Graph Chat.app
export default defineConfig({
  name: "Pi Graph Chat",
  bundleId: "com.everettjf.pi-graph-chat",
  version: "0.3.0",
  entry: "dist-server/server/index.js",
  icon: "docs/assets/app-icon.png",
  menuBarIcon: "docs/assets/menubar-icon.png",
  resources: { static: "dist" },
  server: {
    env: {
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: "4317",
      PI_GRAPH_CHAT_CLIENT_DIR: "${RESOURCES}/static",
      PI_GRAPH_CHAT_DATA_DIR: "${APP_SUPPORT}",
    },
  },
  healthUrl: "http://127.0.0.1:4317/health",
  openUrl: "http://127.0.0.1:4317",
  menu: [{ label: "Open Pi Graph Chat", action: "open" }],
});
