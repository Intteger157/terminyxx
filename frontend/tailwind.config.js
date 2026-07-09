/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1419',
          raised: '#1a2332',
          overlay: '#243044',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
        },
        border: {
          DEFAULT: '#2d3a4f',
        },
      },
    },
  },
  plugins: [],
}
