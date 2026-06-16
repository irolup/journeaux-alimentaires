import { useEffect, useState } from "react";
import { searchFoods, getServingSizes } from "../services/cnf.service";
import {
  addDiaryEntry,
  deleteDiaryEntry,
  getDiaryEntries,
  getDiaryDates,
  getDiarySummary,
  getMultiDaySummaries,
} from "../services/diary.service";
import {
  MACRO_NUTRIENT_IDS,
  MINERAL_NUTRIENT_IDS,
  VITAMIN_NUTRIENT_IDS,
  type CnfFood,
  type CnfServingSize,
} from "../types/cnf.types";
import type { DailySummary, DiaryEntryWithNutrients } from "../types/diary.types";

const MEAL_LABELS: Record<string, string> = {
  BREAKFAST: "Déjeuner",
  LUNCH: "Dîner",
  DINNER: "Souper",
  SNACK: "Collation",
};

type SummaryColumnKey = "entries" | "kcal" | "protein" | "carbs" | "fat" | "fibre";

const SUMMARY_COLUMNS: { key: SummaryColumnKey; label: string }[] = [
  { key: "entries", label: "Aliments" },
  { key: "kcal", label: "Énergie (kcal)" },
  { key: "protein", label: "Protéines (g)" },
  { key: "carbs", label: "Glucides (g)" },
  { key: "fat", label: "Lipides (g)" },
  { key: "fibre", label: "Fibres (g)" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapeCsv(value: unknown): string {
  const stringValue = String(value ?? "");
  const escaped = stringValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob(["\ufeff", csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function NutrientTable({
  title,
  nutrients,
}: {
  title: string;
  nutrients: { name: string; value: number; unit: string }[];
}) {
  if (nutrients.length === 0) return null;

  return (
    <div className="nutrient-group">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>Nutriment</th>
            <th>Valeur</th>
          </tr>
        </thead>
        <tbody>
          {nutrients.map((nutrient) => (
            <tr key={nutrient.name}>
              <td>{nutrient.name}</td>
              <td>
                {nutrient.value} {nutrient.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DiaryPage() {
  const [date, setDate] = useState(todayIso());
  const [entries, setEntries] = useState<DiaryEntryWithNutrients[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [multiDayLimit, setMultiDayLimit] = useState(7);
  const [multiDaySummaries, setMultiDaySummaries] = useState<DailySummary[]>([]);
  const [multiDayTotals, setMultiDayTotals] = useState<DailySummary | null>(null);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [selectedSummaryColumns, setSelectedSummaryColumns] = useState<SummaryColumnKey[]>([
    "entries",
    "kcal",
    "protein",
    "carbs",
    "fat",
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [foods, setFoods] = useState<CnfFood[]>([]);
  const [selectedFood, setSelectedFood] = useState<CnfFood | null>(null);
  const [measures, setMeasures] = useState<CnfServingSize[]>([]);
  const [quantity, setQuantity] = useState("1");
  const [unitType, setUnitType] = useState<"GRAMS" | "MEASURE">("GRAMS");
  const [measureName, setMeasureName] = useState("");
  const [mealType, setMealType] = useState<string>("");
  const [adding, setAdding] = useState(false);

  async function loadDiary(selectedDate: string) {
    setLoading(true);
    setError("");
    try {
      const [diaryEntries, dailySummary] = await Promise.all([
        getDiaryEntries(selectedDate),
        getDiarySummary(selectedDate),
      ]);
      setEntries(diaryEntries);
      setSummary(dailySummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  async function loadMultiDay() {
    try {
      const dates = getDiaryDates(multiDayLimit);
      if (dates.length === 0) {
        setMultiDaySummaries([]);
        setMultiDayTotals(null);
        return;
      }
      const { summaries, totals } = await getMultiDaySummaries(dates);
      setMultiDaySummaries(summaries);
      setMultiDayTotals(totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement des totaux multi-jours");
    }
  }

  useEffect(() => {
    loadDiary(date);
  }, [date]);

  useEffect(() => {
    loadMultiDay();
  }, [multiDayLimit]);

  useEffect(() => {
    if (selectedFood && searchQuery === selectedFood.food_description) {
      setFoods([]);
      return;
    }

    if (searchQuery.length < 2) {
      setFoods([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const results = await searchFoods(searchQuery);
        setFoods(results);
      } catch {
        setFoods([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery, selectedFood]);

  async function selectFood(food: CnfFood) {
    setSelectedFood(food);
    setSearchQuery(food.food_description);
    setFoods([]);
    const sizes = await getServingSizes(food.food_code);
    setMeasures(sizes);
    if (sizes.length > 0) {
      setMeasureName(sizes[0].measure_name);
    }
  }

  async function handleAddEntry() {
    if (!selectedFood) return;

    setAdding(true);
    setError("");

    try {
      await addDiaryEntry({
        date,
        foodCode: selectedFood.food_code,
        foodName: selectedFood.food_description,
        quantity: Number(quantity),
        unitType,
        measureName: unitType === "MEASURE" ? measureName : undefined,
        mealType: mealType ? (mealType as "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK") : undefined,
      });

      setSelectedFood(null);
      setSearchQuery("");
      setQuantity("1");
      setUnitType("GRAMS");
      setMealType("");
      await loadDiary(date);
      await loadMultiDay();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'ajout");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      deleteDiaryEntry(id);
      await loadDiary(date);
      await loadMultiDay();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de suppression");
    }
  }

  function toggleSummaryColumn(key: SummaryColumnKey) {
    setSelectedSummaryColumns((current) => {
      const isSelected = current.includes(key);
      if (isSelected) {
        const next = current.filter((k) => k !== key);
        return next.length === 0 ? current : next;
      }
      return [...current, key];
    });
  }

  function getRowValue(summary: DailySummary, key: SummaryColumnKey): number {
    if (key === "entries") return summary.entryCount;
    if (key === "kcal") return summary.totals.macros.find((n) => n.nutrientNameId === 208)?.value ?? 0;
    if (key === "protein") return summary.totals.macros.find((n) => n.nutrientNameId === 203)?.value ?? 0;
    if (key === "carbs") return summary.totals.macros.find((n) => n.nutrientNameId === 205)?.value ?? 0;
    if (key === "fat") return summary.totals.macros.find((n) => n.nutrientNameId === 204)?.value ?? 0;
    if (key === "fibre") return summary.totals.macros.find((n) => n.nutrientNameId === 291)?.value ?? 0;
    return 0;
  }

  async function exportSummaryCsv() {
    if (multiDaySummaries.length === 0 || !multiDayTotals) return;

    const separator = ";";
    const header = ["Date", ...selectedSummaryColumns.map((key) => SUMMARY_COLUMNS.find((c) => c.key === key)?.label ?? key)];

    const rows = [
      header,
      ...multiDaySummaries.map((s) => [
        s.date,
        ...selectedSummaryColumns.map((key) => getRowValue(s, key)),
      ]),
      [
        "Total",
        ...selectedSummaryColumns.map((key) => getRowValue(multiDayTotals, key)),
      ],
    ];

    const csv = rows
      .map((row) => row.map(escapeCsv).join(separator))
      .join("\n");

    const dates = getDiaryDates(multiDayLimit);
    const oldest = dates[dates.length - 1] ?? todayIso();
    const newest = dates[0] ?? todayIso();
    downloadCsv(`resume-${dates.length}j-${oldest}-a-${newest}.csv`, csv);
  }

  async function exportDetailsCsv() {
    const dates = getDiaryDates(multiDayLimit);
    if (dates.length === 0) return;

    const separator = ";";
    const header = ["Date", "Type", "Nutriment", "Valeur", "Unité", "ID nutriment", "Nombre d'aliments"];
    const rows: Array<Array<string | number>> = [header];

    const summaries = await Promise.all(dates.map((d) => getDiarySummary(d)));

    function nutrientType(nutrientNameId: number): string {
      if (MACRO_NUTRIENT_IDS.has(nutrientNameId)) return "Macro";
      if (MINERAL_NUTRIENT_IDS.has(nutrientNameId)) return "Minéral";
      if (VITAMIN_NUTRIENT_IDS.has(nutrientNameId)) return "Vitamine";
      return "Autre";
    }

    for (const s of summaries.sort((a, b) => b.date.localeCompare(a.date))) {
      for (const nutrient of s.totals.all) {
        rows.push([
          s.date,
          nutrientType(nutrient.nutrientNameId),
          nutrient.name,
          nutrient.value,
          nutrient.unit,
          nutrient.nutrientNameId,
          s.entryCount,
        ]);
      }
    }

    const csv = rows
      .map((row) => row.map(escapeCsv).join(separator))
      .join("\n");

    const oldest = dates[dates.length - 1];
    const newest = dates[0];
    downloadCsv(`details-totaux-${dates.length}j-${oldest}-a-${newest}.csv`, csv);
  }

  return (
    <div className="diary-page">
      <header className="page-header">
        <div>
          <h1>Journal alimentaire</h1>
          <p className="subtitle">Calculez vos macronutriments, minéraux et vitamines</p>
        </div>
        <label className="date-picker">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </header>

      {error && <p className="error banner">{error}</p>}

      <section className="card">
        <h2>Ajouter un aliment</h2>
        <div className="form-grid">
          <label>
            Rechercher un aliment (FCÉN)
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedFood(null);
              }}
              placeholder="Ex: poulet, riz, pomme..."
            />
          </label>

          {foods.length > 0 && (
            <ul className="food-results">
              {foods.map((food) => (
                <li key={food.food_code}>
                  <button type="button" onClick={() => selectFood(food)}>
                    {food.food_description}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedFood && (
            <>
              <label>
                Quantité
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>

              <label>
                Unité
                <select
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value as "GRAMS" | "MEASURE")}
                >
                  <option value="GRAMS">Grammes</option>
                  <option value="MEASURE">Portion (tasse, ml, etc.)</option>
                </select>
              </label>

              {unitType === "MEASURE" && (
                <label>
                  Mesure
                  <select
                    value={measureName}
                    onChange={(e) => setMeasureName(e.target.value)}
                  >
                    {measures.map((measure) => (
                      <option key={measure.measure_name} value={measure.measure_name}>
                        {measure.measure_name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                Repas (optionnel)
                <select value={mealType} onChange={(e) => setMealType(e.target.value)}>
                  <option value="">—</option>
                  <option value="BREAKFAST">Déjeuner</option>
                  <option value="LUNCH">Dîner</option>
                  <option value="DINNER">Souper</option>
                  <option value="SNACK">Collation</option>
                </select>
              </label>

              <button type="button" onClick={handleAddEntry} disabled={adding}>
                {adding ? "Ajout..." : "Ajouter au journal"}
              </button>
            </>
          )}
        </div>
      </section>

      <div className="diary-grid">
        <section className="card">
          <h2>Aliments du jour ({entries.length})</h2>
          {loading ? (
            <p>Chargement...</p>
          ) : entries.length === 0 ? (
            <p className="empty">Aucun aliment enregistré pour cette date.</p>
          ) : (
            <ul className="entry-list">
              {entries.map((entry) => (
                <li key={entry.id} className="entry-item">
                  <div className="entry-header">
                    <strong>{entry.foodName}</strong>
                    <button type="button" className="delete-btn" onClick={() => handleDelete(entry.id)}>
                      Supprimer
                    </button>
                  </div>
                  <p className="entry-meta">
                    {entry.quantity}{" "}
                    {entry.unitType === "GRAMS" ? "g" : entry.measureName}
                    {entry.mealType && ` · ${MEAL_LABELS[entry.mealType]}`}
                  </p>
                  <div className="entry-macros">
                    {entry.nutrients.macros.map((n) => (
                      <span key={n.nutrientNameId}>
                        {n.name}: {n.value} {n.unit}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card summary-card">
          <h2>Totaux de la journée</h2>
          {!summary || summary.entryCount === 0 ? (
            <p className="empty">Ajoutez des aliments pour voir les totaux.</p>
          ) : (
            <>
              <NutrientTable title="Macronutriments" nutrients={summary.totals.macros} />
              <NutrientTable title="Minéraux" nutrients={summary.totals.minerals} />
              <NutrientTable title="Vitamines" nutrients={summary.totals.vitamins} />
            </>
          )}
        </section>
      </div>

      <section className="card">
        <div className="multi-header">
          <div>
            <h2>Résumé multi-jours</h2>
            <p className="subtitle">Totaux par jour + total sur la période</p>
          </div>
          <div className="multi-controls">
            <label className="inline-label period-input">
              Période (jours)
              <input
                type="number"
                min={1}
                max={365}
                value={multiDayLimit}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (!Number.isNaN(value) && value >= 1) {
                    setMultiDayLimit(Math.min(365, Math.floor(value)));
                  }
                }}
              />
            </label>

            <div className="column-menu">
              <button
                type="button"
                className="column-menu-btn"
                onClick={() => setShowColumnMenu((v) => !v)}
              >
                Colonnes
              </button>
              {showColumnMenu && (
                <div className="column-menu-popover" role="menu">
                  {SUMMARY_COLUMNS.map((col) => (
                    <label key={col.key} className="column-menu-item">
                      <input
                        type="checkbox"
                        checked={selectedSummaryColumns.includes(col.key)}
                        onChange={() => toggleSummaryColumn(col.key)}
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {(() => {
              const dates = getDiaryDates(multiDayLimit);
              const rangeLabel =
                dates.length > 0 ? `${dates.length} jours (${dates[dates.length - 1]} → ${dates[0]})` : `${multiDayLimit} jours`;

              return (
                <>
                  <button
              type="button"
              className="column-menu-btn"
              onClick={exportSummaryCsv}
              disabled={multiDaySummaries.length === 0 || !multiDayTotals}
              title={`Exporte le tableau « Résumé multi-jours » avec uniquement les colonnes cochées.\nPériode: ${rangeLabel}`}
            >
              Exporter résumé CSV ({dates.length || multiDayLimit} j)
            </button>

                  <button
              type="button"
              className="column-menu-btn"
              onClick={exportDetailsCsv}
              disabled={dates.length === 0}
              title={`Exporte tous les nutriments des « Totaux de la journée » pour chaque jour de la période (format ligne par nutriment).\nPériode: ${rangeLabel}`}
            >
              Exporter détails CSV ({dates.length || multiDayLimit} j)
            </button>
                </>
              );
            })()}
          </div>
        </div>

        {multiDaySummaries.length === 0 || !multiDayTotals ? (
          <p className="empty">Aucune donnée sur cette période.</p>
        ) : (
          <div className="multi-table-wrap">
            <table className="multi-table">
              <thead>
                <tr>
                  <th>Date</th>
                  {selectedSummaryColumns.map((key) => (
                    <th key={key}>
                      {SUMMARY_COLUMNS.find((c) => c.key === key)?.label ?? key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {multiDaySummaries.map((s) => (
                  <tr key={s.date}>
                    <td>{s.date}</td>
                    {selectedSummaryColumns.map((key) => (
                      <td key={`${s.date}-${key}`}>{getRowValue(s, key)}</td>
                    ))}
                  </tr>
                ))}

                <tr className="multi-total-row">
                  <td>Total</td>
                  {selectedSummaryColumns.map((key) => (
                    <td key={`TOTAL-${key}`}>{getRowValue(multiDayTotals, key)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
