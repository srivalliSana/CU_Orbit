/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Newsreader', 'serif'],
      },
      colors: {
        // Brand teal, replacing the old plain Tailwind blue — same shade
        // ladder (50-900) so every existing blue-NNN class (light/dark
        // variants, hover/ring/border states) recolors via a plain
        // find-replace of "blue-" -> "accent-" with zero logic changes.
        accent: {
          50: '#eefbf6', 100: '#d3f3e6', 200: '#a6e6cd', 300: '#72d7b1',
          400: '#3dc496', 500: '#1a8e72', 600: '#167a62', 700: '#136350',
          800: '#114f41', 900: '#0d3c32',
        },
      },
    },
  },
  plugins: [],
}
