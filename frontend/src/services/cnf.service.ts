import type { CnfFood, CnfNutrientAmount, CnfServingSize } from "../types/cnf.types";
import { parseFoodLine, type ParsedFoodLine } from "./pdf-parser.service";

const CNF_BASE = "https://food-nutrition.canada.ca/api/canadian-nutrient-file";

let foodCache: CnfFood[] | null = null;
let foodCacheLang: string | null = null;

async function fetchCnf<T>(endpoint: string, lang = "fr"): Promise<T> {
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${CNF_BASE}/${endpoint}${separator}lang=${lang}&type=json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Erreur FCÉN: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function searchFoods(query: string, lang = "fr"): Promise<CnfFood[]> {
  if (!foodCache || foodCacheLang !== lang) {
    foodCache = await fetchCnf<CnfFood[]>("food/", lang);
    foodCacheLang = lang;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return foodCache.slice(0, 50);
  }

  return foodCache
    .filter((food) => food.food_description.toLowerCase().includes(normalizedQuery))
    .sort(
      (a, b) =>
        scoreCnfMatch(normalizedQuery, b.food_description) -
        scoreCnfMatch(normalizedQuery, a.food_description)
    )
    .slice(0, 50);
}

export async function getNutrientAmounts(
  foodCode: number,
  lang = "fr"
): Promise<CnfNutrientAmount[]> {
  return fetchCnf<CnfNutrientAmount[]>(`nutrientamount/?id=${foodCode}`, lang);
}

export async function getServingSizes(
  foodCode: number,
  lang = "fr"
): Promise<CnfServingSize[]> {
  const sizes = await fetchCnf<CnfServingSize[]>(`servingsize/?id=${foodCode}`, lang);
  return sizes.filter((size) => size.conversion_factor_value > 0);
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PREPARED_FOOD_MARKERS =
  /\b(cereale|cereal|selects|post|kellogg|general mills|pret a manger|pretes|marque|mches)\b/i;

function searchTermsForFood(foodName: string): string[] {
  const trimmed = foodName.trim();
  const terms = [trimmed];

  if (/\b(aux|à la|au|avec)\b/i.test(trimmed)) {
    return terms;
  }

  const afterDe = trimmed.match(/\bde\s+([\wàâäéèêëïîôùûüç-]+)$/i);
  if (afterDe?.[1] && !afterDe[1].includes(" ")) {
    terms.push(afterDe[1]);
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words[0].length >= 3) {
    terms.push(words[0]);
  }

  if (trimmed.endsWith("s") && trimmed.length > 4 && words.length === 1) {
    terms.push(trimmed.slice(0, -1));
  }

  return [...new Set(terms.map((term) => term.toLowerCase()))].filter((term) => term.length >= 2);
}

export function scoreCnfMatch(query: string, description: string): number {
  const q = normalizeMatchText(query);
  const d = normalizeMatchText(description);
  if (!q || !d) return 0;

  let score = 0;

  if (d === q) score += 1000;
  if (d.startsWith(`${q},`) || d.startsWith(`${q} `)) score += 900;

  const qWords = q.split(" ").filter((word) => word.length >= 2);
  const mainWord = qWords[qWords.length - 1] ?? q;

  if (d.startsWith(`${mainWord},`) || d.startsWith(`${mainWord} `)) score += 250;

  for (const word of qWords) {
    if (d.includes(word)) score += word.length * 12;
  }

  for (const char of q.replace(/\s/g, "")) {
    if (d.includes(char)) score += 1;
  }

  if (d.includes(q)) score += q.length * 8;

  if (qWords.length >= 2) {
    const significantWords = qWords.filter(
      (word) => word.length >= 3 && !/^(aux|avec|sans|des|les|une|de|du|la|le)$/i.test(word)
    );
    const matchedCount = significantWords.filter((word) => d.includes(word)).length;
    if (significantWords.length >= 2 && matchedCount < 2) {
      score -= 280;
    }
    if (significantWords[0] && !d.includes(significantWords[0])) {
      score -= 180;
    }
  }

  if (qWords.length <= 2 && PREPARED_FOOD_MARKERS.test(d) && !PREPARED_FOOD_MARKERS.test(q)) {
    score -= 220;
  }

  if (qWords.length <= 2) {
    score -= Math.max(0, d.length - 35) * 2;
  }

  return score;
}

export function pickBestCnfMatch(query: string, foods: CnfFood[]): CnfFood | null {
  if (foods.length === 0) return null;

  let best: CnfFood | null = null;
  let bestScore = 0;

  for (const food of foods) {
    const score = scoreCnfMatch(query, food.food_description);
    if (score > bestScore) {
      bestScore = score;
      best = food;
    }
  }

  return bestScore >= 10 ? best : null;
}

export function matchServingSizeHint(
  hint: string | null,
  sizes: CnfServingSize[]
): CnfServingSize | null {
  if (sizes.length === 0) return null;
  if (!hint) return sizes[0];

  const normalizedHint = normalizeMatchText(hint);
  const keywords =
    normalizedHint === "1"
      ? ["1 moyen", "1 fruit", "1 unite", "1 petite", "1 grande", "1 tranche", "1 portion"]
      : [normalizedHint, `1 ${normalizedHint}`];

  for (const keyword of keywords) {
    const exact = sizes.find((size) => normalizeMatchText(size.measure_name) === keyword);
    if (exact) return exact;
  }

  for (const keyword of keywords) {
    const partial = sizes.find((size) => {
      const measure = normalizeMatchText(size.measure_name);
      return measure.includes(keyword) || keyword.includes(measure);
    });
    if (partial) return partial;
  }

  return sizes[0];
}

export async function resolveUnitForFood(
  foodCode: number,
  parsed: Pick<ParsedFoodLine, "unitType" | "measureHint" | "quantity">
): Promise<{ unitType: "GRAMS" | "MEASURE"; quantity: number; measureName?: string }> {
  const wantsMeasure = parsed.unitType === "MEASURE" || parsed.measureHint != null;

  if (wantsMeasure) {
    const sizes = await getServingSizes(foodCode);
    const matched = matchServingSizeHint(parsed.measureHint, sizes);
    if (matched) {
      return {
        unitType: "MEASURE",
        quantity: parsed.quantity,
        measureName: matched.measure_name,
      };
    }
  }

  return {
    unitType: "GRAMS",
    quantity: parsed.unitType === "GRAMS" ? parsed.quantity : 100,
    measureName: undefined,
  };
}

export async function findBestFoodMatch(query: string): Promise<CnfFood | null> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  let best: CnfFood | null = null;
  let bestScore = 0;

  for (const term of searchTermsForFood(trimmed)) {
    const results = await searchFoods(term);
    const candidate = pickBestCnfMatch(term, results);
    if (!candidate) continue;

    const score = scoreCnfMatch(trimmed, candidate.food_description);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= 15 ? best : null;
}

export async function resolveFoodLineFromText(rawText: string): Promise<{
  cnfSearchQuery: string;
  quantity: number;
  unitType: "GRAMS" | "MEASURE";
  measureName?: string;
  foodCode: number | null;
  foodName: string | null;
}> {
  const parsed = parseFoodLine(rawText);
  const base = {
    cnfSearchQuery: parsed.foodName,
    quantity: parsed.quantity,
    unitType: parsed.unitType,
    measureName: undefined as string | undefined,
    foodCode: null as number | null,
    foodName: null as string | null,
  };

  const food = await findBestFoodMatch(parsed.foodName);
  if (!food) return base;

  base.foodCode = food.food_code;
  base.foodName = food.food_description;
  base.cnfSearchQuery = food.food_description;

  const unit = await resolveUnitForFood(food.food_code, parsed);
  base.unitType = unit.unitType;
  base.quantity = unit.quantity;
  base.measureName = unit.measureName;

  return base;
}
