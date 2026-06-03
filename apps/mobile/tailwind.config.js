/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: "#2dd4bf", dim: "#1a9e8f" },
        amber: "#f59e0b",
        coral: "#fb7185",
      },
    },
  },
};
