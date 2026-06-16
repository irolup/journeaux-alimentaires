import type { CnfFood, CnfNutrientAmount, CnfServingSize } from "../types/cnf.types";

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
