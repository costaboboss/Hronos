export type DayTemplate = {
  id: string;
  name: string;
  slots: Array<string | null>;
  createdAt: string;
};

export type WeekTemplate = {
  id: string;
  name: string;
  days: Array<Array<string | null>>;
  createdAt: string;
};

export type TagGoalMap = Record<string, number>;

const DAY_TEMPLATES_KEY = "chronos.dayTemplates";
const WEEK_TEMPLATES_KEY = "chronos.weekTemplates";
const TAG_GOALS_KEY = "chronos.tagGoals";

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getDayTemplates() {
  return readJson<DayTemplate[]>(DAY_TEMPLATES_KEY, []);
}

export function saveDayTemplate(name: string, slots: Array<string | null>) {
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      slots,
      createdAt: new Date().toISOString(),
    },
    ...getDayTemplates(),
  ];
  writeJson(DAY_TEMPLATES_KEY, next);
  return next;
}

export function deleteDayTemplate(id: string) {
  const next = getDayTemplates().filter((template) => template.id !== id);
  writeJson(DAY_TEMPLATES_KEY, next);
  return next;
}

export function getWeekTemplates() {
  return readJson<WeekTemplate[]>(WEEK_TEMPLATES_KEY, []);
}

export function saveWeekTemplate(name: string, days: Array<Array<string | null>>) {
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      days,
      createdAt: new Date().toISOString(),
    },
    ...getWeekTemplates(),
  ];
  writeJson(WEEK_TEMPLATES_KEY, next);
  return next;
}

export function deleteWeekTemplate(id: string) {
  const next = getWeekTemplates().filter((template) => template.id !== id);
  writeJson(WEEK_TEMPLATES_KEY, next);
  return next;
}

export function getTagGoals() {
  return readJson<TagGoalMap>(TAG_GOALS_KEY, {});
}

export function setTagGoal(tagId: number, hoursPerDay: number | null) {
  const next = { ...getTagGoals() };
  if (hoursPerDay === null || hoursPerDay <= 0) {
    delete next[String(tagId)];
  } else {
    next[String(tagId)] = hoursPerDay;
  }
  writeJson(TAG_GOALS_KEY, next);
  return next;
}
