/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        rig: {
          dark: "#0b0f17",
          panel: "#121824",
          border: "#1f293d",
          accent: "#3b82f6",
          amber: "#f59e0b",
          green: "#10b981",
          red: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
