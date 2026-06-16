import type { MealType } from "../types/diary.types";
import type { ParsedPdfDocument, ParsedPdfMeal } from "../types/pdf.types";

export const MAX_JOURNAL_DAYS = 3;

const MEAL_LABELS: { pattern: RegExp; label: string; mealType: MealType }[] = [
  { pattern: /^Déjeuner$/i, label: "Déjeuner", mealType: "BREAKFAST" },
  { pattern: /^Collation\s*avant-midi$/i, label: "Collation avant-midi", mealType: "SNACK" },
  { pattern: /^Dîner$/i, label: "Dîner", mealType: "LUNCH" },
  { pattern: /^Collation\s*après-midi$/i, label: "Collation après-midi", mealType: "SNACK" },
  { pattern: /^Souper$/i, label: "Souper", mealType: "DINNER" },
  { pattern: /^Collation\s*soirée$/i, label: "Collation soirée", mealType: "SNACK" },
];

const SKIP_LINE = [
  /^Annexe A$/i,
  /^Journal alimentaire$/i,
  /^Marche à suivre$/i,
  /^Repas$/i,
  /^Heure$/i,
  /^Quantité et aliments$/i,
  /^Commentaires$/i,
  /^Module 6/i,
  /^Nom\s*:/i,
  /^_{3,}$/,
  /^\d+$/,
  /^Repas\s+Heure\s+Quantité et aliments(?:\s+Commentaires)?$/i,
  /^Jour\s*$/i,
  /^Jour\s+de\s*$/i,
];

const TIME_IN_TEXT =
  String.raw`\d{1,2}h(?:\d{2})?|\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm)`;

const TABLE_ROW = new RegExp(
  `^(Déjeuner|Collation avant-midi|Dîner|Collation après-midi|Souper|Collation soirée|Repas|Collation)\\s+(?:(?:vers|à)\\s+)?(${TIME_IN_TEXT})\\s+(.+)$`,
  "i"
);

const COLLATION_SUFFIX_ROW = new RegExp(
  `^(avant-midi|après-midi|soirée)\\s+(?:(?:vers|à)\\s+)?(${TIME_IN_TEXT})\\s+(.+)$`,
  "i"
);

const COLLATION_SUFFIX_FOOD_ROW =
  /^(avant-midi|après-midi|soirée)\s+((?:\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+).+)$/i;

const COLLATION_WITH_SUFFIX_ROW = new RegExp(
  `^Collation\\s+(avant-midi|après-midi|soirée)\\s+(?:(?:vers|à)\\s+)?(${TIME_IN_TEXT})\\s+(.+)$`,
  "i"
);

const COLLATION_WITH_SUFFIX_FOOD_ROW =
  /^Collation\s+(avant-midi|après-midi|soirée)\s+((?:\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+).+)$/i;

const MEAL_PREFIX_NOISE = new RegExp(
  `^(?:(?:Collation\\s+)?(?:avant-midi|après-midi|soirée)|Collation(?:\\s+(?:avant-midi|après-midi|soirée))?|Déjeuner|Dîner|Souper|Repas)(?:\\s+(?:(?:vers|à)\\s+)?(?:${TIME_IN_TEXT}))?\\s+`,
  "i"
);

const LEADING_TIME_PREFIX = new RegExp(`^(?:(?:vers|à)\\s+)?(?:${TIME_IN_TEXT})\\s+`, "i");

const TIME_ONLY = new RegExp(`^(?:(?:vers|à)\\s+)?(${TIME_IN_TEXT})$`, "i");
const TIME_PREFIX = new RegExp(`^(?:(?:vers|à)\\s+)?(${TIME_IN_TEXT})\\s+(.+)$`, "i");
const DAY_HEADER = /Jour\s*(\d+)\s*:.*$/i;
const DAY_LABEL_HINT =
  /(Jour de travail|Journée de congé|jeudi|vendredi|samedi|dimanche|lundi|mardi|mercredi)/i;

function normalizeTime(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const colon = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) return `${Number(colon[1])}h${colon[2]}`;

  const ampm = trimmed.match(/^(\d{1,2})\s*(am|pm)$/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    if (ampm[2].toLowerCase() === "pm" && hour < 12) hour += 12;
    if (ampm[2].toLowerCase() === "am" && hour === 12) hour = 0;
    return `${hour}h00`;
  }

  return trimmed.replace(/\s+/g, "");
}

function isMealOnlyLine(line: string): boolean {
  const trimmed = line.trim().replace(/\s+/g, " ");
  if (MEAL_LABELS.some((meal) => meal.pattern.test(trimmed))) return true;
  if (/^Collation\s+(avant-midi|après-midi|soirée)$/i.test(trimmed)) return true;
  if (/^(avant-midi|après-midi|soirée)$/i.test(trimmed)) return true;
  if (/^Collation$/i.test(trimmed)) return true;
  return false;
}

function extractTimeFromLine(line: string): { time: string | null; remainder: string | null } {
  const trimmed = line.trim();
  const inline = trimmed.match(TIME_PREFIX);
  if (inline && inline[2].trim().length >= 3) {
    return { time: normalizeTime(inline[1]), remainder: inline[2].trim() };
  }
  const alone = trimmed.match(TIME_ONLY);
  if (alone) {
    return { time: normalizeTime(alone[1]), remainder: null };
  }
  return { time: null, remainder: trimmed };
}

function flushMealBuffer(
  meals: ParsedPdfMeal[],
  state: {
    dayNumber: number;
    dayLabel: string;
    mealLabel: string;
    mealType: MealType | null;
    time: string | null;
    foodLines: string[];
    commentLines: string[];
  }
) {
  if (state.foodLines.length === 0) return;
  flushMeal(meals, {
    dayNumber: state.dayNumber,
    dayLabel: state.dayLabel,
    mealLabel: state.mealLabel,
    mealType: state.mealType,
    time: state.time,
    foodLines: state.foodLines,
    commentLines: state.commentLines,
  });
  state.foodLines = [];
  state.commentLines = [];
}

function shouldSkipLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (SKIP_LINE.some((re) => re.test(trimmed))) return true;
  return isTableHeaderLine(trimmed);
}

function isTableHeaderLine(line: string): boolean {
  const normalized = line
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^repas\s+heure\s+quantite/.test(normalized)) return true;
  if (
    normalized.includes("repas") &&
    normalized.includes("heure") &&
    normalized.includes("quantite")
  ) {
    return true;
  }
  return false;
}

function isNonFoodText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (isTableHeaderLine(trimmed)) return true;
  if (isMealOnlyLine(trimmed)) return true;
  if (MEAL_LABELS.some((meal) => meal.pattern.test(trimmed))) return true;
  if (/^(avant-midi|après-midi|soirée)$/i.test(trimmed)) return true;
  if (/^collation(?:\s+\d{1,2}h)?(?:\s|$)/i.test(trimmed) && !/\d+\s*(tasse|tranche|g|ml)/i.test(trimmed)) {
    return true;
  }
  if (/^(déjeuner|dîner|souper|collation|repas|heure|quantité et aliments|commentaires?)$/i.test(trimmed)) {
    return true;
  }
  if (/^(?:collation\s+)?(?:avant-midi|après-midi|soirée)$/i.test(trimmed.replace(/\s+/g, " "))) {
    return true;
  }
  return false;
}

function resolveCollationMeal(suffix: string): { mealLabel: string; mealType: MealType } {
  const normalized = suffix.toLowerCase();
  const label =
    normalized === "avant-midi"
      ? "Collation avant-midi"
      : normalized === "après-midi"
        ? "Collation après-midi"
        : "Collation soirée";
  const meal = MEAL_LABELS.find((entry) => entry.label === label);
  return { mealLabel: label, mealType: meal?.mealType ?? "SNACK" };
}

function resolveMealLabel(name: string): { mealLabel: string; mealType: MealType | null } {
  if (/^collation$/i.test(name)) {
    return { mealLabel: "Collation", mealType: "SNACK" };
  }
  const meal = MEAL_LABELS.find((entry) => entry.label.toLowerCase() === name.toLowerCase());
  return { mealLabel: meal?.label ?? name, mealType: meal?.mealType ?? null };
}

export function cleanFoodText(text: string): string {
  let result = text.trim().replace(/\s*:\s*$/, "").trim();

  for (let i = 0; i < 4; i++) {
    const next = result.replace(MEAL_PREFIX_NOISE, "").replace(LEADING_TIME_PREFIX, "").trim();
    if (next === result) break;
    result = next;
  }

  if (isNonFoodText(result)) return "";

  return result;
}

function parseTableRow(line: string): {
  mealLabel: string;
  mealType: MealType | null;
  time: string | null;
  foodText: string;
} | null {
  const trimmed = line.trim();

  let match = trimmed.match(COLLATION_WITH_SUFFIX_ROW);
  if (match) {
    const meal = resolveCollationMeal(match[1]);
    const foodText = cleanFoodText(match[3]);
    if (foodText.length < 3) return null;
    return { ...meal, time: normalizeTime(match[2]), foodText };
  }

  match = trimmed.match(COLLATION_WITH_SUFFIX_FOOD_ROW);
  if (match) {
    const meal = resolveCollationMeal(match[1]);
    const foodText = cleanFoodText(match[2]);
    if (foodText.length < 3) return null;
    return { ...meal, time: null, foodText };
  }

  match = trimmed.match(TABLE_ROW);
  if (match) {
    const meal = resolveMealLabel(match[1]);
    const foodText = cleanFoodText(match[3]);
    if (foodText.length < 3 || isNonFoodText(foodText)) return null;
    return { ...meal, time: normalizeTime(match[2]), foodText };
  }

  match = trimmed.match(COLLATION_SUFFIX_ROW);
  if (match) {
    const meal = resolveCollationMeal(match[1]);
    const foodText = cleanFoodText(match[3]);
    if (foodText.length < 3) return null;
    return { ...meal, time: normalizeTime(match[2]), foodText };
  }

  match = trimmed.match(COLLATION_SUFFIX_FOOD_ROW);
  if (match) {
    const meal = resolveCollationMeal(match[1]);
    const foodText = cleanFoodText(match[2]);
    if (foodText.length < 3) return null;
    return { ...meal, time: null, foodText };
  }

  return null;
}

function matchMeal(line: string) {
  const trimmed = line.trim();
  return MEAL_LABELS.find((m) => m.pattern.test(trimmed)) ?? null;
}

function extractPatientName(fullText: string): string | null {
  const match = fullText.match(/Nom\s*:\s*\n?\s*([^\n]+)/i);
  if (!match?.[1]) return null;
  const name = match[1].trim();
  if (!name || name.length < 2 || /^_+$/.test(name)) return null;
  return name;
}

/** Lignes « -piment », « -oignon » : ingrédients listés sous un plat, pas des repas séparés. */
const INGREDIENT_BULLET_LINE = /^[-•*–—]\s*(?![\d/])/;

export function isIngredientBulletLine(line: string): boolean {
  return INGREDIENT_BULLET_LINE.test(line.trim());
}

export function splitFoodLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && !isIngredientBulletLine(line));
}

export interface ParsedFoodLine {
  foodName: string;
  quantity: number;
  unitType: "GRAMS" | "MEASURE";
  measureHint: string | null;
}

const LEADING_NOISE = /^(?:environ|approx\.?|~)\s+/i;

const LIST_MARKER = /^[-–—−•*]\s*/;

const MEASURE_UNIT_START =
  /^(?:tasses?|verres?|tranches?|cuillères?\s*(?:à\s*(?:thé|table|soupe))?|c\.?\s*à\s*(?:thé|table|soupe)|cuillère\s*(?:à\s*)?(?:thé|table|soupe)|g|grammes?|ml|kg)\b/i;

const TRAILING_VOLUME_NOTE =
  /\s+environ\s+\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*(?:ml|cl|l|g|grammes?|kg)?\s*$/i;

function stripLeadingListMarker(text: string): string {
  return text.replace(LIST_MARKER, "");
}

function stripFoodNameNoise(food: string): string {
  let result = food.trim();
  for (let i = 0; i < 3; i++) {
    const next = result.replace(TRAILING_VOLUME_NOTE, "").replace(/[,;:]\s*$/, "").trim();
    if (next === result) break;
    result = next;
  }
  return result;
}

/** Nettoie une ligne extraite du PDF pour affichage et recherche FCÉN. */
export function normalizeFoodLineText(rawText: string): string {
  const text = stripLeadingListMarker(cleanFoodText(rawText).replace(LEADING_NOISE, ""));
  return stripFoodNameNoise(text);
}

function parseQuantityToken(token: string): number {
  const trimmed = token.trim();
  const fracMatch = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const denom = Number(fracMatch[2]);
    return denom === 0 ? 1 : Number(fracMatch[1]) / denom;
  }
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeMeasureHint(raw: string): string {
  const m = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^tasses?$/.test(m)) return "tasse";
  if (/^verres?$/.test(m)) return "verre";
  if (/^tranches?$/.test(m)) return "tranche";
  if (/cuillere.*the|^c a the/.test(m)) return "cuillère à thé";
  if (/cuillere.*(soupe|table)|^c a (soupe|table)/.test(m)) return "cuillère à soupe";
  return raw.toLowerCase().trim();
}


export function parseFoodLine(rawText: string): ParsedFoodLine {
  const text = normalizeFoodLineText(rawText);
  if (!text) {
    return { foodName: rawText.trim(), quantity: 100, unitType: "GRAMS", measureHint: null };
  }

  const withMeasure = text.match(
    /^(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s+(tasses?|verres?|tranches?|cuillères?\s*(?:à\s*thé|à\s*table|à\s*soupe)?|c\.?\s*à\s*(?:thé|table|soupe)|cuillère\s*(?:à\s*)?(?:thé|table|soupe)|g|grammes?|ml|kg)\s+(?:de\s+|d'|d\u2019)?(.+)$/i
  );

  if (withMeasure) {
    const qty = parseQuantityToken(withMeasure[1]);
    const measureRaw = withMeasure[2];
    const food = stripFoodNameNoise(withMeasure[3].trim());
    const isGrams = /^g|grammes?|ml|kg$/i.test(measureRaw.trim());

    return {
      foodName: food,
      quantity: qty,
      unitType: isGrams ? "GRAMS" : "MEASURE",
      measureHint: isGrams ? null : normalizeMeasureHint(measureRaw),
    };
  }

  const countOnly = text.match(/^(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)\s+(.+)$/);
  if (countOnly && !MEASURE_UNIT_START.test(countOnly[2].trim())) {
    return {
      foodName: stripFoodNameNoise(countOnly[2].trim()),
      quantity: parseQuantityToken(countOnly[1]),
      unitType: "MEASURE",
      measureHint: "1",
    };
  }

  const measureNoQty = text.match(
    /^(tasses?|verres?|tranches?|cuillères?\s*(?:à\s*thé|à\s*table|à\s*soupe)?|c\.?\s*à\s*(?:thé|table|soupe)|cuillère\s*(?:à\s*)?(?:thé|table|soupe))\s+(?:de\s+|d'|d\u2019)?(.+)$/i
  );
  if (measureNoQty) {
    return {
      foodName: stripFoodNameNoise(measureNoQty[2].trim()),
      quantity: 1,
      unitType: "MEASURE",
      measureHint: normalizeMeasureHint(measureNoQty[1]),
    };
  }

  return {
    foodName: stripFoodNameNoise(text),
    quantity: 100,
    unitType: "GRAMS",
    measureHint: null,
  };
}

function flushMeal(
  meals: ParsedPdfMeal[],
  ctx: {
    dayNumber: number;
    dayLabel: string;
    mealLabel: string;
    mealType: MealType | null;
    time: string | null;
    foodLines: string[];
    commentLines: string[];
  }
) {
  const items = splitFoodLines(ctx.foodLines.join("\n"));
  if (items.length === 0) return;

  const commentText = ctx.commentLines.join("\n").trim() || null;

  for (let i = 0; i < items.length; i++) {
    const rawText = normalizeFoodLineText(items[i]);
    if (rawText.length < 3 || isNonFoodText(rawText)) continue;
    if (MEAL_LABELS.some((m) => m.pattern.test(rawText))) continue;

    const lowConfidence =
      rawText.length < 8 ||
      /^(déjeuner|dîner|souper|collation)/i.test(rawText) ||
      ctx.mealType === null;

    meals.push({
      id: crypto.randomUUID(),
      dayNumber: ctx.dayNumber,
      dayLabel: ctx.dayLabel,
      mealType: ctx.mealType,
      mealLabel: ctx.mealLabel,
      time: ctx.time,
      rawText,
      commentText: i === 0 ? commentText : null,
      selected: !lowConfidence,
      lowConfidence,
    });
  }
}

export function parseFoodDiaryPdf(fullText: string, fileName: string): ParsedPdfDocument {
  const patientName = extractPatientName(fullText);
  const meals: ParsedPdfMeal[] = [];

  const pages = fullText.split("\f");

  for (const page of pages) {
    const lines = page
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    let dayNumber = 0;
    let dayLabel = "";
    let pendingDayLabel = "";

    let currentMealLabel = "";
    let currentMealType: MealType | null = null;
    let currentTime: string | null = null;
    let foodLines: string[] = [];
    let commentLines: string[] = [];
    let pendingCollation = false;

    const state = () => ({
      dayNumber,
      dayLabel,
      mealLabel: currentMealLabel || "Repas",
      mealType: currentMealType,
      time: currentTime,
      foodLines,
      commentLines,
    });

    const resetMealBuffer = () => {
      currentTime = null;
      foodLines = [];
      commentLines = [];
    };

    const flushCurrentFood = () => {
      const snapshot = state();
      flushMealBuffer(meals, snapshot);
      foodLines = snapshot.foodLines;
      commentLines = snapshot.commentLines;
    };

    for (const line of lines) {
      if (shouldSkipLine(line)) continue;

      const dayMatch = line.match(DAY_HEADER);
      if (dayMatch) {
        flushCurrentFood();

        dayNumber = Number(dayMatch[1]);
        if (dayNumber > MAX_JOURNAL_DAYS) {
          dayNumber = 0;
          currentMealLabel = "";
          currentMealType = null;
          resetMealBuffer();
          continue;
        }
        dayLabel = pendingDayLabel || `Jour ${dayNumber}`;
        pendingDayLabel = "";
        currentMealLabel = "";
        currentMealType = null;
        resetMealBuffer();
        continue;
      }

      if (DAY_LABEL_HINT.test(line) && !matchMeal(line)) {
        pendingDayLabel = line.trim();
        continue;
      }

      const meal = matchMeal(line);
      if (meal) {
        flushCurrentFood();

        currentMealLabel = meal.label;
        currentMealType = meal.mealType;
        resetMealBuffer();
        continue;
      }

      if (dayNumber === 0 || dayNumber > MAX_JOURNAL_DAYS) continue;

      if (/^(avant-midi|après-midi|soirée)$/i.test(line.trim())) {
        const collationMeal = resolveCollationMeal(line.trim());
        flushCurrentFood();
        currentMealLabel = collationMeal.mealLabel;
        currentMealType = collationMeal.mealType;
        resetMealBuffer();
        continue;
      }

      if (/^Collation$/i.test(line.trim())) {
        flushCurrentFood();
        pendingCollation = true;
        continue;
      }

      const lineToParse = pendingCollation ? `Collation ${line}` : line;
      if (pendingCollation) {
        pendingCollation = false;
        if (isMealOnlyLine(lineToParse)) {
          const matched = matchMeal(lineToParse);
          if (matched) {
            flushCurrentFood();
            currentMealLabel = matched.label;
            currentMealType = matched.mealType;
            resetMealBuffer();
            continue;
          }
          const suffix = lineToParse.replace(/^Collation\s+/i, "").trim();
          if (/^(avant-midi|après-midi|soirée)$/i.test(suffix)) {
            const collationMeal = resolveCollationMeal(suffix);
            flushCurrentFood();
            currentMealLabel = collationMeal.mealLabel;
            currentMealType = collationMeal.mealType;
            resetMealBuffer();
            continue;
          }
        }
      }

      const tableRow = parseTableRow(lineToParse);
      if (tableRow) {
        flushCurrentFood();
        currentMealLabel = tableRow.mealLabel;
        currentMealType = tableRow.mealType;
        currentTime = tableRow.time;
        foodLines.push(tableRow.foodText);
        continue;
      }

      // Retry raw line if prefixed "Collation" broke a non-collation row
      if (lineToParse !== line) {
        const fallbackRow = parseTableRow(line);
        if (fallbackRow) {
          flushCurrentFood();
          currentMealLabel = fallbackRow.mealLabel;
          currentMealType = fallbackRow.mealType;
          currentTime = fallbackRow.time;
          foodLines.push(fallbackRow.foodText);
          continue;
        }
      }

      const { time, remainder } = extractTimeFromLine(line);
      if (time) {
        flushCurrentFood();
        currentTime = time;
        if (remainder) {
          if (!currentMealLabel) currentMealLabel = "Repas";
          const cleaned = cleanFoodText(remainder);
          if (cleaned.length >= 3) foodLines.push(cleaned);
        }
        continue;
      }

      if (/^(qté|mayo|moutarde|pain\s*:|format|portions|grosseur|déjeuner\/diner)/i.test(line)) {
        commentLines.push(line);
        continue;
      }

      if (!currentMealLabel) {
        currentMealLabel = "Repas";
      }

      const cleanedLine = cleanFoodText(line);
      if (
        cleanedLine.length >= 3 &&
        !isNonFoodText(cleanedLine) &&
        !isIngredientBulletLine(cleanedLine)
      ) {
        foodLines.push(cleanedLine);
      }
    }

    flushCurrentFood();
  }

  return {
    fileName,
    patientName,
    meals: meals.filter(
      (meal) => meal.dayNumber >= 1 && meal.dayNumber <= MAX_JOURNAL_DAYS
    ),
  };
}

export function suggestCnfQuery(rawText: string): string {
  const line = splitFoodLines(rawText)[0] ?? rawText.trim();
  return parseFoodLine(line).foodName;
}
