import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PAGAR, RECEBER, categoryLabel } from "./lib/categories.js";
import { addDays, addMonths, FilterButton, isoDate, moneyText, parseISO, Stat, todayISO } from "./ui.jsx";

const PIE_COLORS = ["#34d399", "#ff5c7a", "#ffb020", "#3fe0ff", "#c4b5fd", "#86efac", "#fda4af", "#f9a8d4", "#a5b4fc", "#a3e635"];

export default function Graficos({ items, incluiFamilia = false }) {
  const [preset, setPreset] = useState("mes");
  const [bucket, setBucket] = useState("month");
  const [from, setFrom] = useState(addMonths(todayISO(), -2));
  const [to, setTo] = useState(todayISO());
  const [tipo, setTipo] = useState("todos");
  const [categoria, setCategoria] = useState("todas");
  const [situacao, setSituacao] = useState("ambos");

  const window = useMemo(() => {
    const today = todayISO();
    const dates = items.map((item) => item.prazo).filter(Boolean).sort();
    const first = dates[0] || today;
    const last = dates.at(-1) || today;
    if (preset === "dia") return { from: addDays(today, -7), to: addDays(today, 7), bucket: "day" };
    if (preset === "semana") return { from: addDays(today, -28), to: addDays(today, 56), bucket: "week" };
    if (preset === "mes") return { from: `${addMonths(today, -2).slice(0, 7)}-01`, to: addMonths(today, 9), bucket: "month" };
    if (preset === "ano") return { from: first, to: last < first ? first : last, bucket: "year" };
    return { from, to: to < from ? from : to, bucket };
  }, [preset, from, to, bucket, items]);

  const filtered = useMemo(
    () => items.filter((item) => item.ativo && item.prazo && item.prazo >= window.from && item.prazo <= window.to && (tipo === "todos" || item.tipo === tipo) && (categoria === "todas" || item.categoria === categoria) && (situacao === "ambos" || (situacao === "abertos" ? !item.feito : item.feito))),
    [items, window, tipo, categoria, situacao],
  );

  const series = useMemo(() => buildSeries(filtered, window), [filtered, window]);
  const hoje = series.find((row) => row.hoje);
  const slices = useMemo(() => buildSlices(filtered), [filtered]);
  const pagar = filtered.filter((item) => item.tipo === "pagar").reduce((sum, item) => sum + item.valor, 0);
  const receber = filtered.filter((item) => item.tipo === "receber").reduce((sum, item) => sum + item.valor, 0);
  const options = [...PAGAR, ...RECEBER].filter((item, index, list) => list.findIndex(([id]) => id === item[0]) === index);

  return (
    <div>
      {incluiFamilia ? <p className="mb-3 text-sm text-[var(--muted)]">Estes gráficos somam a sua planilha com a do cônjuge e dos filhos.</p> : null}
      <div className="flex flex-wrap gap-2">
        {[
          ["dia", "Diário"],
          ["semana", "Semanal"],
          ["mes", "Mensal"],
          ["ano", "Anual"],
          ["livre", "Personalizado"],
        ].map(([id, label]) => (
          <FilterButton key={id} active={preset === id} onClick={() => setPreset(id)}>{label}</FilterButton>
        ))}
      </div>
      {preset === "livre" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="field w-auto" />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="field w-auto" />
          {[
            ["day", "Por dia"],
            ["week", "Por semana"],
            ["month", "Por mês"],
            ["year", "Por ano"],
          ].map(([id, label]) => (
            <FilterButton key={id} active={bucket === id} onClick={() => setBucket(id)}>{label}</FilterButton>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          ["todos", "Tudo"],
          ["pagar", "A pagar"],
          ["receber", "A receber"],
        ].map(([id, label]) => (
          <FilterButton key={id} active={tipo === id} onClick={() => setTipo(id)}>{label}</FilterButton>
        ))}
        <select value={categoria} onChange={(event) => setCategoria(event.target.value)} className="field w-auto">
          <option value="todas">Todas as categorias</option>
          {options.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        {[
          ["ambos", "Abertos e pagos"],
          ["abertos", "Em aberto"],
          ["feitos", "Concluídos"],
        ].map(([id, label]) => (
          <FilterButton key={id} active={situacao === id} onClick={() => setSituacao(id)}>{label}</FilterButton>
        ))}
      </div>

      <motion.div key={`${preset}-${window.bucket}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Sai no período" amount={pagar} />
        <Stat label="Entra no período" amount={receber} />
        <Stat label="Saldo do filtro" amount={receber - pagar} accent />
      </section>

      <ChartCard title="Entradas e saídas">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series}>
            <defs>
              <linearGradient id="pagarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff5c7a" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#ff5c7a" stopOpacity="0.15" />
              </linearGradient>
              <linearGradient id="receberGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" stroke="#a8b0bd" fontSize={12} tickLine={false} />
            <YAxis stroke="#a8b0bd" fontSize={11} tickLine={false} width={36} tickFormatter={(value) => (Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : value)} />
            <Tooltip cursor={{ stroke: "#3fe0ff", strokeDasharray: "3 3" }} content={<MoneyTip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {hoje ? <ReferenceLine x={hoje.label} stroke="#a3e635" strokeDasharray="4 4" /> : null}
            <Bar dataKey="pagar" name="A pagar" fill="url(#pagarGrad)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="receber" name="A receber" fill="url(#receberGrad)" radius={[6, 6, 0, 0]} />
            <Line type="monotone" dataKey="saldo" name="Saldo acumulado" stroke="#3fe0ff" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Saldo acumulado">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" stroke="#a8b0bd" fontSize={12} tickLine={false} />
            <YAxis stroke="#a8b0bd" fontSize={11} tickLine={false} width={36} tickFormatter={(value) => (Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : value)} />
            <Tooltip cursor={{ stroke: "#3fe0ff", strokeDasharray: "3 3" }} content={<MoneyTip />} />
            {hoje ? <ReferenceLine x={hoje.label} stroke="#a3e635" strokeDasharray="4 4" /> : null}
            <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#3fe0ff" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="glass mt-4 min-w-0 overflow-hidden rounded-3xl p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-medium text-zinc-200">Por categoria</h2>
        {slices.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">Nada neste filtro.</p>
        ) : (
          <>
            <div className="mx-auto h-[200px] w-full max-w-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="valor" nameKey="nome" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
                    {slices.map((slice, index) => (
                      <Cell key={slice.nome} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<MoneyTip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-2">
              {slices.map((slice, index) => (
                <li key={slice.nome} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate text-[var(--text)]">{slice.nome}</span>
                  <span className="tabular shrink-0 text-xs text-[var(--muted)]">{slice.parte}%</span>
                  <span className="tabular shrink-0 text-sm text-[var(--text)]">{moneyText(slice.valor)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      </motion.div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <section className="glass mt-4 min-w-0 overflow-hidden rounded-3xl p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-medium text-zinc-200">{title}</h2>
      <div className="h-[220px] w-full min-w-0 overflow-hidden sm:h-[280px]">{children}</div>
    </section>
  );
}

function MoneyTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const liquido = row && "pagar" in row ? row.receber - row.pagar : null;
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs text-zinc-200 shadow-xl backdrop-blur">
      {label ? <p className="mb-1 text-zinc-400">{label}</p> : null}
      {payload.map((item) => (
        <p key={item.name} className="tabular">{item.name}: {moneyText(item.value)}</p>
      ))}
      {liquido == null ? null : <p className={`tabular mt-1 border-t border-white/10 pt-1 ${liquido < 0 ? "text-[var(--out)]" : "text-[var(--info)]"}`}>Saldo líquido: {moneyText(liquido)}</p>}
    </div>
  );
}

function buildSeries(items, window) {
  const keys = bucketKeys(window.from, window.to, window.bucket);
  const map = new Map(keys.map((key) => [key, { key, label: bucketLabel(key, window.bucket), pagar: 0, receber: 0, saldo: 0 }]));
  for (const item of items) {
    const key = bucketOf(item.prazo, window.bucket);
    const row = map.get(key);
    if (!row) continue;
    row[item.tipo] += item.valor;
  }
  let running = 0;
  return [...map.values()].map((row) => {
    running += row.receber - row.pagar;
    return { ...row, hoje: row.key === bucketOf(todayISO(), window.bucket), saldo: Math.round(running * 100) / 100, pagar: round(row.pagar), receber: round(row.receber) };
  });
}

function buildSlices(items) {
  const map = new Map();
  for (const item of items) {
    const nome = `${item.tipo === "pagar" ? "Pagar" : "Receber"} · ${categoryLabel(item.categoria)}`;
    map.set(nome, (map.get(nome) || 0) + item.valor);
  }
  const rows = [...map.entries()].map(([nome, valor]) => ({ nome, valor: round(valor) })).sort((a, b) => b.valor - a.valor);
  const total = rows.reduce((sum, row) => sum + row.valor, 0) || 1;
  return rows.map((row) => ({ ...row, parte: Math.round((row.valor / total) * 100) }));
}

function bucketKeys(from, to, bucket) {
  const list = [];
  if (bucket === "day") {
    for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) list.push(cursor);
  } else if (bucket === "week") {
    for (let cursor = monday(from); cursor <= to; cursor = addDays(cursor, 7)) list.push(cursor);
  } else if (bucket === "month") {
    for (let cursor = `${from.slice(0, 7)}-01`; cursor.slice(0, 7) <= to.slice(0, 7); cursor = addMonths(cursor, 1)) list.push(cursor.slice(0, 7));
  } else {
    for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year += 1) list.push(String(year));
  }
  return list;
}

function bucketOf(iso, bucket) {
  if (bucket === "day") return iso.slice(0, 10);
  if (bucket === "week") return monday(iso);
  if (bucket === "month") return iso.slice(0, 7);
  return iso.slice(0, 4);
}

function monday(iso) {
  const date = parseISO(iso);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return isoDate(date);
}

function bucketLabel(key, bucket) {
  if (bucket === "year") return key;
  if (bucket === "month") return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(parseISO(`${key}-01`));
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(parseISO(key));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
