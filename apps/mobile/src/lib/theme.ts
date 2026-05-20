export const colors = {
  bgBase: "#0d1117",
  bgCard: "#161b22",
  bgCard2: "#1c2128",
  border: "#30363d",
  textPrimary: "#e6edf3",
  textSecondary: "#8b949e",
  teal: "#2dd4bf",
  tealDim: "#14b8a6",
  tealGlow: "rgba(45, 212, 191, 0.15)",
  amber: "#f59e0b",
  coral: "#fb7185",
  blue: "#60a5fa",
} as const;

export const subtypeColor: Record<string, string> = {
  "Luminal A": colors.teal,
  "Luminal B": colors.blue,
  "HER2": colors.amber,
  "Triple Negative": colors.coral,
};

export const subtypePlain: Record<string, string> = {
  "Luminal A": "Most common — typically slower-growing and hormone-sensitive",
  "Luminal B": "Hormone-sensitive but tends to grow faster than Luminal A",
  "HER2": "Tests positive for HER2 protein — targeted therapies available",
  "Triple Negative": "Negative for three receptors — typically treated with chemotherapy",
};
