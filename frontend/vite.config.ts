import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const backendEnv = loadEnv(mode, path.resolve(__dirname, '../backend'), '')
  const localEnv = loadEnv(mode, process.cwd(), '')

  const discordClientId =
    process.env.VITE_DISCORD_CLIENT_ID ||
    process.env.DISCORD_CLIENT_ID ||
    localEnv.VITE_DISCORD_CLIENT_ID ||
    localEnv.DISCORD_CLIENT_ID ||
    rootEnv.VITE_DISCORD_CLIENT_ID ||
    rootEnv.DISCORD_CLIENT_ID ||
    backendEnv.DISCORD_CLIENT_ID ||
    backendEnv.VITE_DISCORD_CLIENT_ID ||
    '1529520646151737374'

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_DISCORD_CLIENT_ID': JSON.stringify(discordClientId)
    },
    server: {
      allowedHosts: true,
      proxy: {
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true
        },
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true
        }
      }
    }
  }
})
