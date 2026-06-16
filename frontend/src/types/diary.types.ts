import type { ComputedNutrients } from "./cnf.types";

export type UnitType = "GRAMS" | "MEASURE";
export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

export interface DiaryEntry {
  id: string;
  date: string;
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
  date: string;
  foodCode: number;
  foodName: string;
  quantity: number;
  unitType: UnitType;
  measureName?: string;
  mealType?: MealType;
}

export interface DailySummary {
  date: string;
  entryCount: number;
  totals: ComputedNutrients;
}
