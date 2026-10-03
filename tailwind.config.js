/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        rig: {
          bg: "#121212",
          surface: "#181818",
          panel: "#161616",
          subsurface: "#1e1e1e",
          border: "#282828",
          borderHover: "#383838",
          foreground: "#f3f3f3",
          secondary: "#cccccc",
          muted: "#777777",
          accent: "#007acc",
          accentHover: "#0062a3",
        },
      },
      fontFamily: {
        sans: ["Cantarell", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
