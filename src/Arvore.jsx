import { ChevronDown } from "lucide-react";
import { addDays, isoDate, parseISO, todayISO } from "./ui.jsx";

export function mondayOf(iso) {
  const date = parseISO(iso);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return isoDate(date);
}

export function chavesDoDia(iso) {
  const day = String(iso).slice(0, 10);
  const year = day.slice(0, 4);
  const month = day.slice(0, 7);
  return [year, month, `${month}|${mondayOf(day)}`, day];
}

export function chavesDeHoje(today = todayISO()) {
  return chavesDoDia(today).slice(0, 3);
}

export function montarArvore(entradas) {
  const loose = [];
  const byDay = new Map();
  for (const row of entradas) {
    const iso = String(row.iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      loose.push(row.item);
      continue;
    }
    if (!byDay.has(iso)) byDay.set(iso, []);
    byDay.get(iso).push(row.item);
  }

  const years = new Map();
  for (const iso of [...byDay.keys()].sort()) {
    const year = iso.slice(0, 4);
    const month = iso.slice(0, 7);
    const week = `${month}|${mondayOf(iso)}`;
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year);
    if (!months.has(month)) months.set(month, new Map());
    const weeks = months.get(month);
    if (!weeks.has(week)) weeks.set(week, new Map());
    weeks.get(week).set(iso, byDay.get(iso));
  }

  return {
    loose,
    years: [...years.entries()].map(([year, months]) => {
      const monthNodes = [...months.entries()].map(([month, weeks]) => {
        const weekNodes = [...weeks.entries()].map(([week, days]) => {
          const dayNodes = [...days.entries()].map(([day, items]) => ({ key: day, label: rotuloDia(day), items }));
          return { key: week, label: rotuloSemana(month, week.split("|")[1]), items: dayNodes.flatMap((day) => day.items), days: dayNodes };
        });
        return { key: month, label: rotuloMes(month), items: weekNodes.flatMap((week) => week.items), weeks: weekNodes };
      });
      return { key: year, label: year, items: monthNodes.flatMap((month) => month.items), months: monthNodes };
    }),
  };
}

export function Arvore({ arvore, abertos, alternar, resumo, badgeDia, renderDia }) {
  const vazio = arvore.loose.length === 0 && arvore.years.length === 0;
  if (vazio) return null;
  return (
    <div className="mt-4 space-y-3 pb-28">
      {arvore.loose.length ? (
        <Nivel id="sem-dia" label="Sem dia" aside={resumo(arvore.loose)} aberto={abertos.has("sem-dia")} onToggle={alternar}>
          {renderDia(arvore.loose, "")}
        </Nivel>
      ) : null}
      {arvore.years.map((year) => (
        <Nivel key={year.key} id={year.key} label={year.label} aside={resumo(year.items)} aberto={abertos.has(year.key)} onToggle={alternar}>
          <div className="space-y-2">
            {year.months.map((month) => (
              <Nivel key={month.key} id={month.key} label={month.label} aside={resumo(month.items)} aberto={abertos.has(month.key)} onToggle={alternar} interno>
                <div className="space-y-2">
                  {month.weeks.map((week) => (
                    <Nivel key={week.key} id={week.key} label={week.label} aside={resumo(week.items)} aberto={abertos.has(week.key)} onToggle={alternar} interno>
                      <div className="space-y-2">
                        {week.days.map((day) => (
                          <Nivel key={day.key} id={day.key} label={day.label} badge={badgeDia ? badgeDia(day.key, day.items) : null} aside={resumo(day.items)} aberto={abertos.has(day.key)} onToggle={alternar} interno>
                            {renderDia(day.items, day.key)}
                          </Nivel>
                        ))}
                      </div>
                    </Nivel>
                  ))}
                </div>
              </Nivel>
            ))}
          </div>
        </Nivel>
      ))}
    </div>
  );
}

function Nivel({ id, label, badge, aside, aberto, onToggle, interno, children }) {
  return (
    <div id={`periodo-${id}`} className={interno ? "overflow-hidden rounded-[12px] border border-white/10" : "overflow-hidden rounded-3xl border border-white/10"}>
      <button type="button" aria-expanded={aberto} onClick={() => onToggle(id)} className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown size={14} className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${aberto ? "rotate-180" : ""}`} />
          <span className="truncate text-sm text-[var(--text)]">{label}</span>
          {badge}
        </span>
        <span className="shrink-0">{aside}</span>
      </button>
      <div className={`overflow-hidden transition-[max-height] duration-200 ease-out ${aberto ? "max-h-[8000px]" : "max-h-0"}`}>
        <div className="border-t border-white/5 px-2 py-2">{children}</div>
      </div>
    </div>
  );
}

function rotuloDia(iso) {
  const date = parseISO(iso);
  const nome = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date).split("-")[0];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${date.getDate()}`;
}

function rotuloMes(month) {
  const [year, mes] = month.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(year, mes - 1, 1));
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}`;
}

function rotuloSemana(month, monday) {
  const [year, mes] = month.split("-").map(Number);
  const first = new Date(year, mes - 1, 1);
  const last = new Date(year, mes, 0);
  const start = parseISO(monday);
  const end = parseISO(addDays(monday, 6));
  const from = start < first ? first : start;
  const to = end > last ? last : end;
  const curto = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(first);
  if (from.getDate() === to.getDate()) return `${from.getDate()} ${curto}`;
  return `${from.getDate()} a ${to.getDate()} ${curto}`;
}
