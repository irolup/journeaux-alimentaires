import {
  type ComputedNutrients,
  type CnfNutrientAmount,
  type NutrientValue,
  MACRO_NUTRIENT_IDS,
  MINERAL_NUTRIENT_IDS,
  NUTRIENT_UNITS,
  VITAMIN_NUTRIENT_IDS,
} from "../types/cnf.types";
import type { UnitType } from "../types/diary.types";
import { getNutrientAmounts, getServingSizes } from "./cnf.service";

function computeScaleFactor(
  quantity: number,
  unitType: UnitType,
  conversionFactor?: number
): number {
  if (unitType === "GRAMS") {
    return quantity / 100;
  }

  if (conversionFactor === undefined) {
    throw new Error("Facteur de conversion requis pour une portion en mesure");
  }

  return quantity * conversionFactor;
}

function scaleNutrients(
  nutrients: CnfNutrientAmount[],
  factor: number
): NutrientValue[] {
  return nutrients
    .filter((nutrient) => nutrient.nutrient_value > 0)
    .map((nutrient) => ({
      nutrientNameId: nutrient.nutrient_name_id,
      name: nutrient.nutrient_web_name,
      value: Math.round(nutrient.nutrient_value * factor * 100) / 100,
      unit: NUTRIENT_UNITS[nutrient.nutrient_name_id] ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function groupNutrients(values: NutrientValue[]): ComputedNutrients {
  return {
    macros: values.filter((value) => MACRO_NUTRIENT_IDS.has(value.nutrientNameId)),
    minerals: values.filter((value) => MINERAL_NUTRIENT_IDS.has(value.nutrientNameId)),
    vitamins: values.filter((value) => VITAMIN_NUTRIENT_IDS.has(value.nutrientNameId)),
    all: values,
  };
}

export async function computeEntryNutrients(
  foodCode: number,
  quantity: number,
  unitType: UnitType,
  measureName?: string,
  lang = "fr"
): Promise<ComputedNutrients> {
  const nutrients = await getNutrientAmounts(foodCode, lang);
  let factor: number;

  if (unitType === "GRAMS") {
    factor = computeScaleFactor(quantity, unitType);
  } else {
    const servingSizes = await getServingSizes(foodCode, lang);
    const normalizedMeasure = measureName?.trim().toLowerCase() ?? "";
    const measure =
      servingSizes.find((size) => size.measure_name === measureName) ??
      servingSizes.find(
        (size) => size.measure_name.trim().toLowerCase() === normalizedMeasure
      ) ??
      (servingSizes.length === 1 ? servingSizes[0] : undefined);

    if (!measure) {
      throw new Error(`Mesure introuvable: ${measureName ?? "non spécifiée"}`);
    }

    factor = computeScaleFactor(quantity, unitType, measure.conversion_factor_value);
  }

  return groupNutrients(scaleNutrients(nutrients, factor));
}

export function sumNutrients(entries: ComputedNutrients[]): ComputedNutrients {
  const totals = new Map<number, NutrientValue>();

  for (const entry of entries) {
    for (const nutrient of entry.all) {
      const existing = totals.get(nutrient.nutrientNameId);
      if (existing) {
        existing.value = Math.round((existing.value + nutrient.value) * 100) / 100;
      } else {
        totals.set(nutrient.nutrientNameId, { ...nutrient });
      }
    }
  }

  const values = Array.from(totals.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "fr")
  );

  return groupNutrients(values);
}
