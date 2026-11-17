export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function moneyText(value) {
  return brl.format(Number(value) || 0);
}

export function parseMoney(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const negative = text.startsWith("-");
  const cleaned = text.replace(/^-/, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round((negative ? -value : value) * 100) / 100;
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function parseISO(iso) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDays(iso, count) {
  const date = parseISO(iso);
  date.setDate(date.getDate() + count);
  return isoDate(date);
}

export function addMonths(iso, count) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const cursor = new Date(year, month - 1 + count, 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  return `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function formatDate(iso) {
  if (!iso) return "Sem dia";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(parseISO(iso));
}

export function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function daysFromToday(iso) {
  return Math.round((parseISO(iso).getTime() - parseISO(todayISO()).getTime()) / 86400000);
}

export function whenLabel(iso) {
  if (!iso) return "Sem dia";
  const days = daysFromToday(iso);
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  if (days === -1) return "Ontem";
  if (days > 1) return `Em ${days} dias`;
  return `Atrasado há ${Math.abs(days)} dias`;
}

export function toDatetimeLocal(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocal(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function FilterButton({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1.5 text-xs ${active ? "bg-white text-zinc-950" : "bg-white/5 text-zinc-400"}`}>
      {children}
    </button>
  );
}

export function Stat({ label, value, hint, accent = false }) {
  return (
    <article className={`rounded-3xl border p-4 ${accent ? "border-[#d6ff4a]/40 bg-[#d6ff4a]/10" : "border-white/10 bg-white/[0.03]"}`}>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className={`mt-2 text-xl font-semibold tracking-tight ${accent ? "text-[#d6ff4a]" : "text-zinc-50"}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </article>
  );
}
