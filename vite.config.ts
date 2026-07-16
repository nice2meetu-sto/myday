import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 배포: https://<user>.github.io/myday/
export default defineConfig({
  base: '/myday/',
  plugins: [react()],
})
