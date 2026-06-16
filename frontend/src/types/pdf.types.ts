import type { MealType } from "./diary.types";

export interface ParsedPdfMeal {
  id: string;
  dayNumber: number;
  dayLabel: string;
  mealType: MealType | null;
  mealLabel: string;
  time: string | null;
  rawText: string;
  commentText: string | null;
  selected: boolean;
  lowConfidence: boolean;
}

export interface ParsedPdfDocument {
  fileName: string;
  patientName: string | null;
  meals: ParsedPdfMeal[];
}

export interface PdfImportRow extends ParsedPdfMeal {
  foodCode: number | null;
  foodName: string | null;
  quantity: number;
  unitType: "GRAMS" | "MEASURE";
  measureName?: string;
  cnfSearchQuery: string;
}
