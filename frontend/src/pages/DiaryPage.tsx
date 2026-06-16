import { useEffect, useState } from "react";
import PdfImportPanel from "../components/PdfImportPanel";
import { searchFoods, getServingSizes } from "../services/cnf.service";
import {
  addDiaryEntry,
  clearAllDiaryEntries,
  deleteDiaryEntry,
  getAllDiaryEntriesRaw,
  getDiaryEntries,
  getDiarySummary,
  getEntriesWithoutDay,
  getJournalDayNumbers,
  getMultiDaySummaries,
  updateDiaryEntryDayNumber,
} from "../services/diary.service";
import { MAX_JOURNAL_DAYS } from "../services/pdf-parser.service";
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
  const [selectedDay, setSelectedDay] = useState(1);
  const [entries, setEntries] = useState<DiaryEntryWithNutrients[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  const [unassignedEntries, setUnassignedEntries] = useState<DiaryEntryWithNutrients[]>([]);
  const [pendingDays, setPendingDays] = useState<Record<string, number>>({});
  const [assigningDayId, setAssigningDayId] = useState<string | null>(null);

  async function loadUnassigned() {
    try {
      const unassigned = await getEntriesWithoutDay();
      setUnassignedEntries(unassigned);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement des entrées sans jour");
    }
  }

  async function loadDiary(dayNumber: number) {
    setLoading(true);
    setError("");
    try {
      const [diaryEntries, dailySummary] = await Promise.all([
        getDiaryEntries(dayNumber),
        getDiarySummary(dayNumber),
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
      const { summaries, totals } = await getMultiDaySummaries(getJournalDayNumbers());
      setMultiDaySummaries(summaries);
      setMultiDayTotals(totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement des totaux multi-jours");
    }
  }

  useEffect(() => {
    loadDiary(selectedDay);
    loadUnassigned();
  }, [selectedDay]);

  useEffect(() => {
    loadMultiDay();
  }, []);

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
        dayNumber: selectedDay,
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
      await loadDiary(selectedDay);
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
      await loadDiary(selectedDay);
      await loadUnassigned();
      await loadMultiDay();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de suppression");
    }
  }

  async function handleClearAll() {
    const count = getAllDiaryEntriesRaw().length;
    if (count === 0) return;

    const confirmed = window.confirm(
      `Supprimer les ${count} entrée${count > 1 ? "s" : ""} du journal ? Cette action est irréversible.`
    );
    if (!confirmed) return;

    try {
      clearAllDiaryEntries();
      setPendingDays({});
      await loadDiary(selectedDay);
      await loadUnassigned();
      await loadMultiDay();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    }
  }

  async function handleAssignDay(entryId: string) {
    const targetDay = pendingDays[entryId];
    if (!targetDay) {
      setError("Choisissez un jour (1, 2 ou 3) avant d'assigner.");
      return;
    }

    setAssigningDayId(entryId);
    setError("");

    try {
      await updateDiaryEntryDayNumber(entryId, targetDay);
      setPendingDays((current) => {
        const next = { ...current };
        delete next[entryId];
        return next;
      });
      await loadDiary(selectedDay);
      await loadUnassigned();
      await loadMultiDay();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'assignation du jour");
    } finally {
      setAssigningDayId(null);
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
    const header = ["Jour", ...selectedSummaryColumns.map((key) => SUMMARY_COLUMNS.find((c) => c.key === key)?.label ?? key)];

    const rows = [
      header,
      ...multiDaySummaries.map((s) => [
        s.dayLabel,
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

    downloadCsv(`resume-jours-1-${MAX_JOURNAL_DAYS}.csv`, csv);
  }

  async function exportDetailsCsv() {
    const dayNumbers = getJournalDayNumbers();
    const separator = ";";
    const header = ["Jour", "Type", "Nutriment", "Valeur", "Unité", "ID nutriment", "Nombre d'aliments"];
    const rows: Array<Array<string | number>> = [header];

    const summaries = await Promise.all(dayNumbers.map((dayNumber) => getDiarySummary(dayNumber)));

    function nutrientType(nutrientNameId: number): string {
      if (MACRO_NUTRIENT_IDS.has(nutrientNameId)) return "Macro";
      if (MINERAL_NUTRIENT_IDS.has(nutrientNameId)) return "Minéral";
      if (VITAMIN_NUTRIENT_IDS.has(nutrientNameId)) return "Vitamine";
      return "Autre";
    }

    for (const s of summaries.sort((a, b) => a.dayNumber - b.dayNumber)) {
      for (const nutrient of s.totals.all) {
        rows.push([
          s.dayLabel,
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

    downloadCsv(`details-totaux-jours-1-${MAX_JOURNAL_DAYS}.csv`, csv);
  }

  return (
    <div className="diary-page">
      <header className="page-header">
        <div>
          <h1>Journal alimentaire</h1>
          <p className="subtitle">Calculez vos macronutriments, minéraux et vitamines</p>
        </div>
        <div className="page-header-actions">
          <label className="day-picker">
            Jour
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(Number(e.target.value))}
            >
              {getJournalDayNumbers().map((day) => (
                <option key={day} value={day}>
                  Jour {day}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="delete-btn clear-all-btn"
            onClick={handleClearAll}
            disabled={getAllDiaryEntriesRaw().length === 0}
            title="Supprime toutes les entrées enregistrées"
          >
            Tout supprimer
          </button>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}

      <section className="card">
        <h2>Ajouter un aliment (Jour {selectedDay})</h2>
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

      <PdfImportPanel
        onImported={async () => {
          await loadDiary(selectedDay);
          await loadUnassigned();
          await loadMultiDay();
        }}
      />

      {unassignedEntries.length > 0 && (
        <section className="card undated-entries-card">
          <h2>Entrées sans jour ({unassignedEntries.length})</h2>
          <p className="subtitle">
            Ces aliments n&apos;ont pas de jour assigné. Choisissez Jour 1, 2 ou 3 pour les inclure
            dans le journal.
          </p>
          <ul className="entry-list">
            {unassignedEntries.map((entry) => (
              <li key={entry.id} className="entry-item undated-entry-item">
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
                <div className="undated-assign-row">
                  <label className="inline-label">
                    Jour
                    <select
                      value={pendingDays[entry.id] ?? ""}
                      onChange={(e) =>
                        setPendingDays((current) => ({
                          ...current,
                          [entry.id]: Number(e.target.value),
                        }))
                      }
                    >
                      <option value="">—</option>
                      {getJournalDayNumbers().map((day) => (
                        <option key={day} value={day}>
                          Jour {day}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAssignDay(entry.id)}
                    disabled={assigningDayId === entry.id}
                  >
                    {assigningDayId === entry.id ? "Assignation…" : "Assigner le jour"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="diary-grid">
        <section className="card">
          <h2>Aliments du Jour {selectedDay} ({entries.length})</h2>
          {loading ? (
            <p>Chargement...</p>
          ) : entries.length === 0 ? (
            <p className="empty">Aucun aliment enregistré pour le Jour {selectedDay}.</p>
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
          <h2>Totaux du Jour {selectedDay}</h2>
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
            <h2>Résumé des 3 jours</h2>
            <p className="subtitle">Totaux par jour (Jour 1, 2 et 3) + total général</p>
          </div>
          <div className="multi-controls">
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

            <button
              type="button"
              className="column-menu-btn"
              onClick={exportSummaryCsv}
              disabled={multiDaySummaries.length === 0 || !multiDayTotals}
              title="Exporte le tableau résumé pour les jours 1 à 3"
            >
              Exporter résumé CSV
            </button>

            <button
              type="button"
              className="column-menu-btn"
              onClick={exportDetailsCsv}
              title="Exporte tous les nutriments pour chaque jour (1 à 3)"
            >
              Exporter détails CSV
            </button>
          </div>
        </div>

        {multiDaySummaries.length === 0 || !multiDayTotals ? (
          <p className="empty">Aucune donnée sur les 3 jours.</p>
        ) : (
          <div className="multi-table-wrap">
            <table className="multi-table">
              <thead>
                <tr>
                  <th>Jour</th>
                  {selectedSummaryColumns.map((key) => (
                    <th key={key}>
                      {SUMMARY_COLUMNS.find((c) => c.key === key)?.label ?? key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {multiDaySummaries.map((s) => (
                  <tr key={s.dayNumber}>
                    <td>{s.dayLabel}</td>
                    {selectedSummaryColumns.map((key) => (
                      <td key={`${s.dayNumber}-${key}`}>{getRowValue(s, key)}</td>
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
