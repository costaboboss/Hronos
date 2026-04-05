export function getEfficiencyTextClass(pct: number) {
  if (pct < 10) return "text-red-500";
  if (pct < 20) return "text-pink-400";
  if (pct < 30) return "text-yellow-100";
  if (pct < 40) return "text-yellow-300";
  if (pct < 50) return "text-lime-300";
  if (pct < 60) return "text-green-400";
  if (pct < 70) return "text-green-500";
  if (pct < 80) return "text-emerald-500";
  if (pct < 90) return "text-emerald-400";
  return "text-emerald-300";
}

export function getEfficiencyColor(pct: number) {
  if (pct < 10) return "#ef4444";
  if (pct < 20) return "#f472b6";
  if (pct < 30) return "#fef9c3";
  if (pct < 40) return "#fde047";
  if (pct < 50) return "#bef264";
  if (pct < 60) return "#4ade80";
  if (pct < 70) return "#22c55e";
  if (pct < 80) return "#10b981";
  if (pct < 90) return "#059669";
  return "#047857";
}
