export interface CnfFood {
  food_code: number;
  food_description: string;
}

export interface CnfNutrientAmount {
  food_code: number;
  nutrient_value: number;
  standard_error: number;
  number_observation: number;
  nutrient_name_id: number;
  nutrient_web_name: string;
  nutrient_source_id: number;
}

export interface CnfServingSize {
  food_code: number;
  food_description: string;
  conversion_factor_value: number;
  measure_name: string;
}

export interface NutrientValue {
  nutrientNameId: number;
  name: string;
  value: number;
  unit: string;
}

export interface ComputedNutrients {
  macros: NutrientValue[];
  minerals: NutrientValue[];
  vitamins: NutrientValue[];
  all: NutrientValue[];
}

export const NUTRIENT_UNITS: Record<number, string> = {
  203: "g",
  204: "g",
  205: "g",
  208: "kcal",
  268: "kJ",
  291: "g",
  301: "mg",
  303: "mg",
  304: "mg",
  305: "mg",
  306: "mg",
  307: "mg",
  309: "mg",
  312: "mg",
  315: "mg",
  317: "µg",
  401: "mg",
  404: "mg",
  406: "mg",
  415: "mg",
  418: "µg",
  430: "µg",
};

export const MACRO_NUTRIENT_IDS = new Set([203, 204, 205, 208, 291]);
export const MINERAL_NUTRIENT_IDS = new Set([301, 303, 304, 305, 306, 307, 309, 312, 315, 317]);
export const VITAMIN_NUTRIENT_IDS = new Set([401, 404, 406, 415, 418, 430]);
