import { useEffect, useState } from "react";

export const DEFAULT_WORK_NORM_BLOCKS = 40;
export const WORK_NORM_STORAGE_KEY = "chronos-work-norm-blocks";

function normalizeNorm(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_WORK_NORM_BLOCKS;
  return Math.min(96, Math.max(1, Math.round(value)));
}

export function getWorkNormBlocks() {
  if (typeof window === "undefined") return DEFAULT_WORK_NORM_BLOCKS;
  const raw = window.localStorage.getItem(WORK_NORM_STORAGE_KEY);
  if (!raw) return DEFAULT_WORK_NORM_BLOCKS;
  return normalizeNorm(Number.parseInt(raw, 10));
}

export function useWorkNorm() {
  const [workNormBlocks, setWorkNormBlocks] = useState<number>(() =>
    getWorkNormBlocks()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      WORK_NORM_STORAGE_KEY,
      String(normalizeNorm(workNormBlocks))
    );
  }, [workNormBlocks]);

  return {
    workNormBlocks,
    setWorkNormBlocks: (value: number) =>
      setWorkNormBlocks(normalizeNorm(value)),
  };
}

export function blocksToPercent(blocks: number, workNormBlocks: number) {
  if (workNormBlocks <= 0) return 0;
  return Math.min(100, Math.round((blocks / workNormBlocks) * 100));
}

export function blocksToHours(blocks: number) {
  return (blocks * 15) / 60;
}
