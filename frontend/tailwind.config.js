/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F5F0',
        'canvas-alt': '#F2F0EA',
        ink: '#1C1917',
        'ink-light': '#78716C',
      },
      fontFamily: {
        sans: ['Inter', 'DM Sans', 'Geist', 'system-ui', 'sans-serif'],
        heading: ['Inter', 'DM Sans', 'Geist', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'DM Serif Display', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    },
  },
  plugins: [],
}
