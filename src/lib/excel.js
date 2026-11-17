import { categoryLabel, categoriesFor } from "./categories.js";

const HEADER = {
  titulo: ["nome", "titulo", "título", "descricao", "descrição", "lancamento", "lançamento", "item"],
  valor: ["valor", "quantia", "preco", "preço", "amount"],
  prazo: ["data", "prazo", "vencimento", "dia", "date"],
  tipo: ["tipo", "natureza", "movimento"],
  categoria: ["categoria", "grupo", "classe"],
};

function norm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function looksDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return true;
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(text)) return true;
  return false;
}

function looksMoney(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  return /^-?\d{1,3}(\.\d{3})*,\d{2}$/.test(text) || /^-?\d+([.,]\d+)?$/.test(text);
}

export async function readTable(file) {
  const loaded = await import("xlsx");
  const XLSX = loaded.default ?? loaded;
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  return rows
    .map((row) => row.map((cell) => (cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? "").trim())))
    .filter((row) => row.some(Boolean));
}

export function guessMapping(rows) {
  if (!rows.length) return { header: false, columns: {} };
  const head = rows[0].map(norm);
  const columns = {};
  for (const [field, names] of Object.entries(HEADER)) {
    const index = head.findIndex((cell) => names.includes(cell));
    if (index >= 0) columns[field] = index;
  }
  if (columns.titulo != null && columns.valor != null) return { header: true, columns };

  const sample = rows.slice(0, 12);
  const width = Math.max(...sample.map((row) => row.length));
  const score = Array.from({ length: width }, (_, index) => {
    const cells = sample.map((row) => row[index]).filter(Boolean);
    return {
      index,
      dates: cells.filter(looksDate).length,
      money: cells.filter(looksMoney).length,
      text: cells.filter((cell) => !looksDate(cell) && !looksMoney(cell)).length,
    };
  });
  const dateCol = [...score].sort((a, b) => b.dates - a.dates)[0];
  const moneyCol = [...score].sort((a, b) => b.money - a.money)[0];
  const textCol = [...score]
    .filter((item) => item.index !== moneyCol?.index && item.index !== dateCol?.index)
    .sort((a, b) => b.text - a.text)[0];
  return {
    header: false,
    columns: {
      titulo: textCol?.index ?? 0,
      valor: moneyCol?.index ?? 1,
      prazo: dateCol && dateCol.dates > 0 ? dateCol.index : "",
    },
  };
}

export function parseDateCell(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function parseTipo(value) {
  const text = norm(value);
  if (!text) return "pagar";
  if (/receber|entrada|credito|crédito|renda|salario|salário/.test(text)) return "receber";
  return "pagar";
}

export function parseCategoria(tipo, value) {
  const text = norm(value);
  const found = categoriesFor(tipo).find(([id, label]) => norm(id) === text || norm(label) === text);
  return found?.[0] || (tipo === "receber" ? "outro" : "outro");
}

export function columnName(index) {
  return `Coluna ${index + 1}`;
}

export function headersOf(rows, header) {
  if (!rows.length) return [];
  if (!header) return rows[0].map((_, index) => columnName(index));
  return rows[0].map((cell, index) => cell || columnName(index));
}

export function labelOf(id) {
  return categoryLabel(id);
}
