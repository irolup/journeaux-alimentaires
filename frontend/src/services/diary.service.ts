import type {
  DailySummary,
  DiaryEntry,
  DiaryEntryWithNutrients,
  NewDiaryEntry,
} from "../types/diary.types";
import { computeEntryNutrients, sumNutrients } from "./nutrition.service";
import { MAX_JOURNAL_DAYS } from "./pdf-parser.service";

const STORAGE_KEY = "journeaux-alimentaires-entries";

type LegacyDiaryEntry = Partial<DiaryEntry> & { date?: string | null };

function normalizeDayNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const day = Math.floor(value);
  if (day < 1 || day > MAX_JOURNAL_DAYS) return null;
  return day;
}

function migrateEntry(raw: LegacyDiaryEntry): DiaryEntry {
  const dayNumber = normalizeDayNumber(raw.dayNumber);
  return {
    id: raw.id ?? crypto.randomUUID(),
    dayNumber,
    foodCode: raw.foodCode ?? 0,
    foodName: raw.foodName ?? "",
    quantity: raw.quantity ?? 0,
    unitType: raw.unitType ?? "GRAMS",
    measureName: raw.measureName,
    mealType: raw.mealType,
    createdAt: raw.createdAt ?? new Date().toISOString(),
  };
}

function loadAllEntries(): DiaryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as LegacyDiaryEntry[]).map(migrateEntry);
  } catch {
    return [];
  }
}

function saveAllEntries(entries: DiaryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function dayLabel(dayNumber: number): string {
  return `Jour ${dayNumber}`;
}

export function getAllDiaryEntriesRaw(): DiaryEntry[] {
  return loadAllEntries();
}

export function getJournalDayNumbers(): number[] {
  return Array.from({ length: MAX_JOURNAL_DAYS }, (_, index) => index + 1);
}

export function getJournalDaysWithData(): number[] {
  const set = new Set<number>();
  for (const entry of loadAllEntries()) {
    if (entry.dayNumber != null) set.add(entry.dayNumber);
  }
  return Array.from(set).sort((a, b) => a - b);
}

async function withNutrients(entry: DiaryEntry): Promise<DiaryEntryWithNutrients> {
  return {
    ...entry,
    nutrients: await computeEntryNutrients(
      entry.foodCode,
      entry.quantity,
      entry.unitType,
      entry.measureName
    ),
  };
}

export async function getDiaryEntries(dayNumber: number): Promise<DiaryEntryWithNutrients[]> {
  const entries = loadAllEntries()
    .filter((entry) => entry.dayNumber === dayNumber)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return Promise.all(entries.map(withNutrients));
}

export async function getDiarySummary(dayNumber: number): Promise<DailySummary> {
  const entries = loadAllEntries().filter((entry) => entry.dayNumber === dayNumber);

  const nutrientsList = await Promise.all(
    entries.map((entry) =>
      computeEntryNutrients(
        entry.foodCode,
        entry.quantity,
        entry.unitType,
        entry.measureName
      )
    )
  );

  return {
    dayNumber,
    dayLabel: dayLabel(dayNumber),
    entryCount: entries.length,
    totals: sumNutrients(nutrientsList),
  };
}

export async function getMultiDaySummaries(
  dayNumbers: number[] = getJournalDayNumbers()
): Promise<{ summaries: DailySummary[]; totals: DailySummary }> {
  const summaries = await Promise.all(dayNumbers.map((dayNumber) => getDiarySummary(dayNumber)));
  const allComputed = summaries.map((summary) => summary.totals);

  return {
    summaries: summaries.sort((a, b) => a.dayNumber - b.dayNumber),
    totals: {
      dayNumber: 0,
      dayLabel: "Total",
      entryCount: summaries.reduce((acc, summary) => acc + summary.entryCount, 0),
      totals: sumNutrients(allComputed),
    },
  };
}

export async function addDiaryEntry(data: NewDiaryEntry): Promise<DiaryEntryWithNutrients> {
  const entry: DiaryEntry = {
    id: crypto.randomUUID(),
    dayNumber: normalizeDayNumber(data.dayNumber),
    foodCode: data.foodCode,
    foodName: data.foodName,
    quantity: data.quantity,
    unitType: data.unitType,
    measureName: data.measureName,
    mealType: data.mealType,
    createdAt: new Date().toISOString(),
  };

  const entries = loadAllEntries();
  entries.push(entry);
  saveAllEntries(entries);

  return withNutrients(entry);
}

export function deleteDiaryEntry(id: string): void {
  const entries = loadAllEntries().filter((entry) => entry.id !== id);
  saveAllEntries(entries);
}

export function clearAllDiaryEntries(): void {
  saveAllEntries([]);
}

export async function getEntriesWithoutDay(): Promise<DiaryEntryWithNutrients[]> {
  const entries = loadAllEntries()
    .filter((entry) => entry.dayNumber == null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return Promise.all(entries.map(withNutrients));
}

export async function updateDiaryEntryDayNumber(
  id: string,
  dayNumber: number | null
): Promise<DiaryEntryWithNutrients | null> {
  const entries = loadAllEntries();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return null;

  entries[index] = { ...entries[index], dayNumber: normalizeDayNumber(dayNumber) };
  saveAllEntries(entries);

  return withNutrients(entries[index]);
}
