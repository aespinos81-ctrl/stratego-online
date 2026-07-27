import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Rutas relativas en el resultado compilado. GitHub Pages sirve el juego desde
  // una subcarpeta (…github.io/stratego-online/), y con rutas absolutas el
  // navegador buscaría los archivos en la raíz del dominio y no encontraría nada.
  base: './',
})
