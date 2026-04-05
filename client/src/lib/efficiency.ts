export function getEfficiencyTextClass(pct: number) {
  if (pct < 10) return "text-red-500";
  if (pct < 20) return "text-pink-400";
  if (pct < 30) return "text-yellow-200";
  if (pct < 50) return "text-yellow-400";
  if (pct < 70) return "text-green-400";
  return "text-emerald-400";
}

export function getEfficiencyColor(pct: number) {
  if (pct < 10) return "#ef4444";
  if (pct < 20) return "#f472b6";
  if (pct < 30) return "#fef08a";
  if (pct < 50) return "#facc15";
  if (pct < 70) return "#4ade80";
  return "#34d399";
}
