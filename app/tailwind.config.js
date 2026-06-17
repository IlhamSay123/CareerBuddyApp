/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./card.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // CareerBuddy — "dealer's table" palette
        bg: {
          dark: "#0f0f17",
          medium: "#1a1a2e",
          soft: "#23233a",
        },
        // Casino felt greens
        felt: {
          dark: "#082a1c",
          DEFAULT: "#0f5132",
          light: "#1a7a55",
          rail: "#0a3324", // darker wood/rail for sidebar
        },
        // Playing-card face
        card: {
          face: "#f6f1e4",
          edge: "#e4d9bf",
          ink: "#1d2125",
        },
        accent: {
          DEFAULT: "#e7c35b", // gold trim
          hover: "#f0d27a",
        },
        status: {
          apply: "#3498db",
          applied: "#f39c12",
          interview: "#9b59b6",
          offer: "#27ae60",
          rejected: "#e74c3c",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 50px -12px rgba(0,0,0,0.65)",
        glow: "0 0 0 1px rgba(231,195,91,0.35), 0 12px 40px -8px rgba(231,195,91,0.25)",
      },
      borderRadius: {
        xl2: "20px",
      },
    },
  },
  plugins: [],
};
