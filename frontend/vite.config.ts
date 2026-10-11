import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The title screen shows a version in its corner. Read from package.json so
  // it cannot drift from the thing it claims to describe.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // Every interface, so a phone on the Wi-Fi can reach it. WSL2 needs more: see .docs/reference/server-guide.md.
    host: true,
    // Pinned so the phone's URL stays put. Not 5173, which another local stack uses.
    port: 5180,
    strictPort: true,
    proxy: {
      // Same-origin API in dev, so a phone only needs to reach this one port. `ws` carries the room-sync socket.
      '/api': { target: 'http://localhost:3000', ws: true },
    },
  },
})
