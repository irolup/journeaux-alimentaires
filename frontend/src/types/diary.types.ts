import type { ComputedNutrients } from "./cnf.types";

export type UnitType = "GRAMS" | "MEASURE";
export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

export interface DiaryEntry {
  id: string;
  /** Jour du journal alimentaire (1, 2 ou 3). */
  dayNumber: number | null;
  foodCode: number;
  foodName: string;
  quantity: number;
  unitType: UnitType;
  measureName?: string;
  mealType?: MealType;
  createdAt: string;
}

export interface DiaryEntryWithNutrients extends DiaryEntry {
  nutrients: ComputedNutrients;
}

export interface NewDiaryEntry {
  dayNumber: number | null;
  foodCode: number;
  foodName: string;
  quantity: number;
  unitType: UnitType;
  measureName?: string;
  mealType?: MealType;
}

export interface DailySummary {
  dayNumber: number;
  dayLabel: string;
  entryCount: number;
  totals: ComputedNutrients;
}
