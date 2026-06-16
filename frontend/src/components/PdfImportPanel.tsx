import { useEffect, useState, type ChangeEvent } from "react";
import {
  resolveFoodLineFromText,
  resolveUnitForFood,
  searchFoods,
} from "../services/cnf.service";
import { addDiaryEntry } from "../services/diary.service";
import { extractTextFromPdf } from "../services/pdf.service";
import {
  parseFoodDiaryPdf,
  parseFoodLine,
  splitFoodLines,
  MAX_JOURNAL_DAYS,
} from "../services/pdf-parser.service";
import type { CnfFood } from "../types/cnf.types";
import type { PdfImportRow } from "../types/pdf.types";

interface PdfImportPanelProps {
  onImported: () => void;
}

function PdfCnfSearchCell({
  query,
  foodName,
  onQueryChange,
  onFoodSelect,
}: {
  query: string;
  foodName: string | null;
  onQueryChange: (query: string) => void;
  onFoodSelect: (food: CnfFood) => void;
}) {
  const [results, setResults] = useState<CnfFood[]>([]);

  useEffect(() => {
    if (foodName && query === foodName) {
      setResults([]);
      return;
    }

    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const found = await searchFoods(query);
        setResults(found);
      } catch {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, foodName]);

  return (
    <div className="pdf-cnf-search">
      <input
        type="text"
        value={query}
        placeholder="Rechercher un aliment…"
        onChange={(e) => onQueryChange(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="food-results pdf-food-results">
          {results.map((food) => (
            <li key={food.food_code}>
              <button
                type="button"
                onClick={() => {
                  onFoodSelect(food);
                  setResults([]);
                }}
              >
                {food.food_description}
              </button>
            </li>
          ))}
        </ul>
      )}
      {foodName && <small className="pdf-cnf-selected">{foodName}</small>}
    </div>
  );
}

function applyParsedFieldsFromText(rawText: string): Partial<PdfImportRow> {
  const parsed = parseFoodLine(rawText);
  return {
    cnfSearchQuery: parsed.foodName,
    quantity: parsed.quantity,
    unitType: parsed.unitType,
    measureName: undefined,
    foodCode: null,
    foodName: null,
    selected: false,
  };
}

function withMatchSelection<T extends { foodCode: number | null; selected?: boolean }>(row: T): T {
  return { ...row, selected: row.foodCode != null };
}

export default function PdfImportPanel({ onImported }: PdfImportPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [patientName, setPatientName] = useState<string | null>(null);
  const [rows, setRows] = useState<PdfImportRow[]>([]);
  const [filterDay, setFilterDay] = useState<number | "all">("all");
  const [filterLowConfidence, setFilterLowConfidence] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState("");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setImportNotice("");
    setRows([]);
    setPatientName(null);

    try {
      const text = await extractTextFromPdf(file);
      const parsed = parseFoodDiaryPdf(text, file.name);

      if (parsed.meals.length === 0) {
        setError(
          "Aucun repas détecté dans ce PDF. Les journaux remplis à la main (macOS Aperçu, annotations manuscrites) ne contiennent parfois pas de texte extractible — essayez de retaper les aliments ou utilisez un PDF rempli avec des champs de formulaire."
        );
        return;
      }

      setPatientName(parsed.patientName);

      const resolvedRows = await Promise.all(
        parsed.meals.map(async (meal) => {
          const resolved = await resolveFoodLineFromText(meal.rawText);
          return withMatchSelection({
            ...meal,
            ...resolved,
          });
        })
      );

      setRows(resolvedRows);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de lecture du PDF");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  function updateRow(id: string, patch: Partial<PdfImportRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function resolveRowMatch(rowId: string) {
    const row = rows.find((entry) => entry.id === rowId);
    if (!row?.rawText.trim()) return;

    try {
      const resolved = await resolveFoodLineFromText(row.rawText);
      updateRow(rowId, withMatchSelection(resolved));
    } catch {
      // ignore per-row match errors
    }
  }

  async function selectFoodForRow(rowId: string, food: CnfFood, rawText: string) {
    const parsed = parseFoodLine(rawText);
    const unit = await resolveUnitForFood(food.food_code, parsed);

    updateRow(rowId, {
      foodCode: food.food_code,
      foodName: food.food_description,
      cnfSearchQuery: food.food_description,
      quantity: unit.quantity,
      unitType: unit.unitType,
      measureName: unit.measureName,
      selected: true,
    });
  }

  async function splitRowIntoLines(rowId: string) {
    const row = rows.find((entry) => entry.id === rowId);
    if (!row) return;

    const lines = splitFoodLines(row.rawText);
    if (lines.length <= 1) return;

    const newRows = await Promise.all(
      lines.map(async (line, lineIndex) => {
        const resolved = await resolveFoodLineFromText(line);
        return withMatchSelection({
          ...row,
          id: crypto.randomUUID(),
          rawText: line,
          commentText: lineIndex === 0 ? row.commentText : null,
          ...resolved,
        });
      })
    );

    setRows((current) => {
      const index = current.findIndex((entry) => entry.id === rowId);
      if (index === -1) return current;
      return [...current.slice(0, index), ...newRows, ...current.slice(index + 1)];
    });
  }

  function toggleAll(selected: boolean) {
    setRows((current) =>
      current.map((row) => {
        const visible = filterDay === "all" || row.dayNumber === filterDay;
        if (!visible) return row;
        if (filterLowConfidence && !row.lowConfidence) return row;
        return { ...row, selected };
      })
    );
  }

  async function importSelectedRows() {
    const selected = rows.filter((r) => r.selected && r.foodCode && r.foodName);
    if (selected.length === 0) {
      setError("Sélectionnez au moins une ligne avec un aliment FCÉN associé.");
      return;
    }

    setImporting(true);
    setError("");
    setImportNotice("");

    try {
      const importedIds = new Set<string>();

      for (const row of selected) {
        if (row.dayNumber < 1 || row.dayNumber > MAX_JOURNAL_DAYS) {
          setError(
            `Jour invalide pour « ${row.rawText.slice(0, 40)} ». Le journal ne couvre que les jours 1 à ${MAX_JOURNAL_DAYS}.`
          );
          return;
        }

        const parsed = parseFoodLine(row.rawText);
        const unit =
          row.unitType === "MEASURE" && !row.measureName && row.foodCode
            ? await resolveUnitForFood(row.foodCode, parsed)
            : {
                unitType: row.unitType,
                quantity: row.quantity,
                measureName: row.measureName,
              };

        await addDiaryEntry({
          dayNumber: row.dayNumber,
          foodCode: row.foodCode!,
          foodName: row.foodName!,
          quantity: unit.quantity,
          unitType: unit.unitType,
          measureName: unit.measureName,
          mealType: row.mealType ?? undefined,
        });
        importedIds.add(row.id);
      }

      const remaining = rows.filter((row) => !importedIds.has(row.id));
      setRows(remaining);

      if (remaining.length === 0) {
        setImportNotice(`${selected.length} ligne(s) importée(s).`);
        setOpen(false);
      } else {
        setImportNotice(
          `${selected.length} ligne(s) importée(s). ${remaining.length} ligne(s) restante(s) à valider.`
        );
      }

      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'importation");
    } finally {
      setImporting(false);
    }
  }

  const visibleRows = rows.filter((row) => {
    if (filterDay !== "all" && row.dayNumber !== filterDay) return false;
    if (filterLowConfidence && !row.lowConfidence) return false;
    return true;
  });

  const dayNumbers = [...new Set(rows.map((r) => r.dayNumber))]
    .filter((day) => day >= 1 && day <= MAX_JOURNAL_DAYS)
    .sort((a, b) => a - b);

  const dayLabelByNumber = new Map<number, string>();
  for (const row of rows) {
    if (row.dayLabel && !dayLabelByNumber.has(row.dayNumber)) {
      dayLabelByNumber.set(row.dayNumber, row.dayLabel);
    }
  }

  return (
    <section className="card pdf-import-card">
      <h2>Importer un journal PDF</h2>
      <p className="subtitle">
        Extrait le texte du PDF, propose une structure par jour/repas, puis vous validez avant
        l&apos;import. L&apos;association FCÉN reste semi-automatique (texte libre variable).
      </p>

      <label className="pdf-upload-label">
        Choisir un PDF
        <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} disabled={loading} />
      </label>

      {loading && <p>Analyse du PDF et association FCÉN en cours…</p>}
      {error && <p className="error banner">{error}</p>}
      {importNotice && <p className="pdf-import-notice">{importNotice}</p>}

      {open && rows.length > 0 && (
        <div className="pdf-review">
          {patientName && <p><strong>Nom détecté :</strong> {patientName}</p>}

          <div className="pdf-review-controls">
            <label className="inline-label">
              Filtrer par jour
              <select
                value={filterDay === "all" ? "all" : String(filterDay)}
                onChange={(e) =>
                  setFilterDay(e.target.value === "all" ? "all" : Number(e.target.value))
                }
              >
                <option value="all">Tous</option>
                {dayNumbers.map((d) => (
                  <option key={d} value={d}>
                    Jour {d}
                    {dayLabelByNumber.get(d) ? ` (${dayLabelByNumber.get(d)})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="column-menu-item filter-checkbox">
              <input
                type="checkbox"
                checked={filterLowConfidence}
                onChange={(e) => setFilterLowConfidence(e.target.checked)}
              />
              <span>Afficher seulement les lignes incertaines</span>
            </label>

            <button type="button" className="column-menu-btn" onClick={() => toggleAll(true)}>
              Tout cocher (filtré)
            </button>
            <button type="button" className="column-menu-btn" onClick={() => toggleAll(false)}>
              Tout décocher (filtré)
            </button>
          </div>

          <div className="pdf-table-wrap">
            <table className="pdf-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Jour</th>
                  <th>Repas</th>
                  <th>Heure</th>
                  <th>Texte extrait</th>
                  <th>FCÉN</th>
                  <th>Qté</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className={row.lowConfidence ? "pdf-row-low" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) => updateRow(row.id, { selected: e.target.checked })}
                      />
                    </td>
                    <td>
                      Jour {row.dayNumber}
                      {row.dayLabel && row.dayLabel !== `Jour ${row.dayNumber}` && (
                        <small className="pdf-day-label">{row.dayLabel}</small>
                      )}
                      {row.lowConfidence && " ⚠"}
                    </td>
                    <td>{row.mealLabel}</td>
                    <td>{row.time ?? "—"}</td>
                    <td className="pdf-raw-cell">
                      <textarea
                        value={row.rawText}
                        rows={2}
                        onChange={(e) =>
                          updateRow(row.id, {
                            rawText: e.target.value,
                            ...applyParsedFieldsFromText(e.target.value),
                          })
                        }
                        onBlur={() => resolveRowMatch(row.id)}
                      />
                      {row.rawText.includes("\n") && (
                        <button
                          type="button"
                          className="column-menu-btn pdf-split-btn"
                          onClick={() => splitRowIntoLines(row.id)}
                        >
                          Scinder en lignes
                        </button>
                      )}
                      {row.commentText && (
                        <small className="pdf-comment">Commentaire : {row.commentText}</small>
                      )}
                    </td>
                    <td className="pdf-cnf-cell">
                      <PdfCnfSearchCell
                        query={row.cnfSearchQuery}
                        foodName={row.foodName}
                        onQueryChange={(query) =>
                          updateRow(row.id, {
                            cnfSearchQuery: query,
                            foodCode: null,
                            foodName: null,
                          })
                        }
                        onFoodSelect={(food) => selectFoodForRow(row.id, food, row.rawText)}
                      />
                    </td>
                    <td className="pdf-qty-cell">
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={row.quantity}
                        onChange={(e) =>
                          updateRow(row.id, { quantity: Number(e.target.value) || 1 })
                        }
                      />
                      <small className="pdf-qty-unit">
                        {row.unitType === "GRAMS"
                          ? "g"
                          : row.measureName ?? "portion"}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="pdf-hint">
            Les lignes ⚠ sont des extractions incertaines — vérifiez-les avant import. Chaque
            saut de ligne du PDF est traité comme un aliment distinct. Quantités et unités
            (tasse, cuillère à thé, g, etc.) sont extraites automatiquement ; l&apos;aliment FCÉN
            le plus proche est présélectionné.
          </p>

          <div className="pdf-import-actions">
            <button
              type="button"
              onClick={importSelectedRows}
              disabled={importing}
            >
              {importing ? "Importation…" : "Importer les lignes sélectionnées (FCÉN associé)"}
            </button>
            <button type="button" className="column-menu-btn" onClick={() => setOpen(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
