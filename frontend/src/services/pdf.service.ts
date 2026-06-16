import * as pdfjs from "pdfjs-dist";
import type { PDFPageProxy, TextContent, TextItem } from "pdfjs-dist/types/src/display/api";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const LINE_Y_TOLERANCE = 4;

interface PositionedText {
  str: string;
  x: number;
  y: number;
}

function groupPositionedTextIntoLines(items: PositionedText[]): string[] {
  const positioned = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: { y: number; parts: { x: number; str: string }[] }[] = [];

  for (const item of positioned) {
    const line = lines.find((entry) => Math.abs(entry.y - item.y) <= LINE_Y_TOLERANCE);
    if (line) {
      line.parts.push({ x: item.x, str: item.str });
    } else {
      lines.push({ y: item.y, parts: [{ x: item.x, str: item.str }] });
    }
  }

  const merged = lines
    .map((line) => {
      line.parts.sort((a, b) => a.x - b.x);
      return line.parts
        .map((part) => part.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    })
    .filter(Boolean);

  return dedupeAdjacentLines(merged);
}

function dedupeAdjacentLines(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (result.length === 0 || result[result.length - 1] !== line) {
      result.push(line);
    }
  }
  return result;
}

function textItemsToPositioned(items: TextContent["items"]): PositionedText[] {
  return items
    .filter((item): item is TextItem => "str" in item && item.str.trim().length > 0)
    .map((item) => ({
      str: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5],
    }));
}

type PdfAnnotation = Awaited<ReturnType<PDFPageProxy["getAnnotations"]>>[number];

function annotationToPositioned(annot: PdfAnnotation): PositionedText[] {
  if (annot.subtype === "Ink") return [];

  const raw =
    annot.contentsObj?.str?.trim() ||
    annot.textContent?.map((part: string) => part.trim()).filter(Boolean).join("\n").trim() ||
    "";

  if (!raw || !annot.rect) return [];

  const [x, y] = annot.rect;
  return raw
    .split("\n")
    .map((line: string) => line.trim())
    .filter(Boolean)
    .map((line: string, index: number) => ({
      str: line,
      x,
      y: y - index * 14,
    }));
}

async function extractPageLines(page: PDFPageProxy): Promise<string[]> {
  const positioned = textItemsToPositioned((await page.getTextContent()).items);

  try {
    const annotations = await page.getAnnotations();
    for (const annot of annotations) {
      positioned.push(...annotationToPositioned(annot));
    }
  } catch {
    // Annotations unavailable on some documents.
  }

  return groupPositionedTextIntoLines(positioned);
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    pages.push((await extractPageLines(page)).join("\n"));
  }

  return pages.join("\f");
}
