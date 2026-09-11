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
    // Bind every interface, not just loopback, so a phone on the same Wi-Fi can
    // reach the dev server. On its own this is not enough under WSL2 — see
    // README's "Testing on a phone" for the Windows-side networking mode.
    host: true,
    // Pinned rather than left to Vite's fallback: the LAN URL you type on the
    // phone has to stay the same between restarts. 5173 is deliberately avoided
    // because another local stack claims it, and under mirrored networking a
    // Windows-side listener collides with ours for real.
    port: 5180,
    strictPort: true,
    proxy: {
      // Keeps the API same-origin in dev, which is what makes the app work
      // unchanged on a phone: the browser only ever needs to reach this one
      // port, and `localhost` never has to mean anything on the device.
      '/api': 'http://localhost:3000',
    },
  },
})
