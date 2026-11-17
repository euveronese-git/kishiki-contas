import { useEffect, useRef, useState } from "react";

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
    <button type="button" onClick={onClick} className={`min-h-8 rounded-full px-3 py-1.5 text-xs transition-colors duration-200 ${active ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-white/5 text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]"}`}>
      {children}
    </button>
  );
}

export function spotlightMove(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
}

export function CountUp({ value }) {
  const [shown, setShown] = useState(Number(value) || 0);
  const from = useRef(Number(value) || 0);

  useEffect(() => {
    const start = from.current;
    const end = Number(value) || 0;
    const began = performance.now();
    let frame = 0;
    const step = (now) => {
      const progress = Math.min(1, (now - began) / 650);
      const eased = 1 - (1 - progress) ** 3;
      setShown(start + (end - start) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
      else from.current = end;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="tabular">{moneyText(shown)}</span>;
}

export function Stat({ label, amount, value, hint, accent = false, className = "" }) {
  return (
    <article onPointerMove={spotlightMove} className={`glass spotlight flex h-full min-w-0 flex-col p-4 ${className}`}>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`relative mt-2 text-2xl font-semibold tracking-tight ${accent ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
        {amount == null ? value : <CountUp value={amount} />}
      </p>
      {hint ? <p className="relative mt-auto pt-2 text-xs text-zinc-500">{hint}</p> : null}
    </article>
  );
}
