export type Theme = "light" | "dark";

export function resolveTheme(
  override: "light" | "dark" | null,
  date: Date = new Date(),
): Theme {
  if (override) return override;
  const hour = date.getHours();
  return hour >= 6 && hour < 18 ? "light" : "dark";
}
