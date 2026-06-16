import type {
  DailySummary,
  DiaryEntry,
  DiaryEntryWithNutrients,
  NewDiaryEntry,
} from "../types/diary.types";
import { computeEntryNutrients, sumNutrients } from "./nutrition.service";

const STORAGE_KEY = "journeaux-alimentaires-entries";

function uniqueSortedDates(entries: DiaryEntry[]): string[] {
  const set = new Set<string>();
  for (const entry of entries) {
    set.add(entry.date);
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

function loadAllEntries(): DiaryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DiaryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveAllEntries(entries: DiaryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function getAllDiaryEntriesRaw(): DiaryEntry[] {
  return loadAllEntries();
}

export async function getDiaryEntries(date: string): Promise<DiaryEntryWithNutrients[]> {
  const entries = loadAllEntries()
    .filter((entry) => entry.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      nutrients: await computeEntryNutrients(
        entry.foodCode,
        entry.quantity,
        entry.unitType,
        entry.measureName
      ),
    }))
  );
}

export async function getDiarySummary(date: string): Promise<DailySummary> {
  const entries = loadAllEntries().filter((entry) => entry.date === date);

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
    date,
    entryCount: entries.length,
    totals: sumNutrients(nutrientsList),
  };
}

export function getDiaryDates(limit = 7): string[] {
  const entries = loadAllEntries();
  return uniqueSortedDates(entries).slice(0, limit);
}

export async function getMultiDaySummaries(
  dates: string[]
): Promise<{ summaries: DailySummary[]; totals: DailySummary }> {
  const summaries = await Promise.all(dates.map((date) => getDiarySummary(date)));
  const allComputed = summaries.map((summary) => summary.totals);

  return {
    summaries: summaries.sort((a, b) => b.date.localeCompare(a.date)),
    totals: {
      date: "TOTAL",
      entryCount: summaries.reduce((acc, s) => acc + s.entryCount, 0),
      totals: sumNutrients(allComputed),
    },
  };
}

export async function addDiaryEntry(data: NewDiaryEntry): Promise<DiaryEntryWithNutrients> {
  const entry: DiaryEntry = {
    id: crypto.randomUUID(),
    date: data.date,
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

  const nutrients = await computeEntryNutrients(
    entry.foodCode,
    entry.quantity,
    entry.unitType,
    entry.measureName
  );

  return { ...entry, nutrients };
}

export function deleteDiaryEntry(id: string): void {
  const entries = loadAllEntries().filter((entry) => entry.id !== id);
  saveAllEntries(entries);
}
