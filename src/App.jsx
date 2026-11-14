import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createItem, deleteItem, explainError, isCloud, listAll, updateItem, updateMeta } from "./lib/db.js";

const CATEGORIES = [
  ["autoescola", "Autoescola"],
  ["casa", "Casa"],
  ["dividas", "Dívidas"],
  ["compras", "Compras"],
  ["obrigacoes", "Obrigações"],
  ["viagem", "Viagem"],
  ["saude", "Saúde"],
  ["fechamento", "Fechamento"],
  ["olx", "OLX"],
  ["site", "Site"],
  ["familia", "Família"],
  ["outro", "Outro"],
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function moneyText(value) {
  return brl.format(Number(value) || 0);
}

function parseMoney(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseISO(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysFromToday(iso) {
  return Math.round((parseISO(iso).getTime() - parseISO(todayISO()).getTime()) / 86400000);
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(parseISO(iso));
}

function whenLabel(iso) {
  if (!iso) return "Sem dia";
  const days = daysFromToday(iso);
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  if (days === -1) return "Ontem";
  if (days > 1) return `Em ${days} dias`;
  return `Atrasado há ${Math.abs(days)} dias`;
}

function addMonths(iso, count) {
  const [year, month, day] = iso.split("-").map(Number);
  const cursor = new Date(year, month - 1 + count, 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const nextDay = Math.min(day, last);
  const nextMonth = String(cursor.getMonth() + 1).padStart(2, "0");
  return `${cursor.getFullYear()}-${nextMonth}-${String(nextDay).padStart(2, "0")}`;
}

function splitCents(total, parts) {
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / parts);
  return Array.from({ length: parts }, (_, index) => (index === parts - 1 ? cents - base * (parts - 1) : base) / 100);
}

function categoryLabel(id) {
  return CATEGORIES.find(([value]) => value === id)?.[1] || id;
}

function units(amount, price) {
  if (amount <= 0.004 || price <= 0) return 0;
  return Math.ceil(amount / price - 1e-9);
}

function summarize(items) {
  const active = items.filter((item) => item.ativo);
  const sum = (list) => list.reduce((total, item) => total + item.valor, 0);
  const openPay = sum(active.filter((item) => item.tipo === "pagar" && !item.feito));
  const paid = sum(active.filter((item) => item.tipo === "pagar" && item.feito));
  const received = sum(active.filter((item) => item.tipo === "receber" && item.feito));
  const pendingOther = sum(active.filter((item) => item.tipo === "receber" && !item.feito && item.categoria !== "site"));
  const pendingSites = sum(active.filter((item) => item.tipo === "receber" && !item.feito && item.categoria === "site"));
  const falta = Math.max(0, openPay - received - pendingOther);
  const seMetasEntrarem = Math.max(0, falta - pendingSites);
  return { openPay, paid, received, pendingOther, pendingSites, falta, seMetasEntrarem };
}

const emptyDraft = {
  tipo: "pagar",
  titulo: "",
  valor: "",
  categoria: "dividas",
  prazo: "",
  detalhe: "",
};

export default function App() {
  const [items, setItems] = useState([]);
  const [metas, setMetas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [situacao, setSituacao] = useState("abertos");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(emptyDraft);
  const [confirmId, setConfirmId] = useState(null);
  const [parcelId, setParcelId] = useState(null);
  const [vezes, setVezes] = useState("12");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    listAll()
      .then((data) => {
        if (!alive) return;
        setItems(data.items);
        setMetas(data.metas);
      })
      .catch((err) => {
        if (alive) setError(explainError(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const totals = summarize(items);
  const sitePrice = metas.find((meta) => meta.id === "site")?.valor ?? 1000;
  const packagePrice = metas.find((meta) => meta.id === "pacote")?.valor ?? 2500;

  const visible = items.filter((item) => {
    if (tipoFiltro !== "todos" && item.tipo !== tipoFiltro) return false;
    if (situacao === "abertos") return !item.feito;
    if (situacao === "feitos") return item.feito;
    return true;
  });

  const groups = [...visible]
    .sort((a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999") || a.ordem - b.ordem)
    .reduce((list, item) => {
      const key = item.prazo || "";
      const last = list.at(-1);
      if (!last || last.key !== key) list.push({ key, items: [item] });
      else last.items.push(item);
      return list;
    }, []);

  function replaceItem(next) {
    setItems((current) => current.map((item) => (item.id === next.id ? next : item)));
  }

  async function run(action) {
    setError("");
    setSaving(true);
    try {
      await action();
    } catch (err) {
      setError(explainError(err));
      const fresh = await listAll().catch(() => null);
      if (fresh) {
        setItems(fresh.items);
        setMetas(fresh.metas);
      }
    } finally {
      setSaving(false);
    }
  }

  function submitNew(event) {
    event.preventDefault();
    const valor = parseMoney(draft.valor);
    if (!draft.titulo.trim() || valor == null) return;
    const ordem = items.filter((item) => item.prazo === draft.prazo).reduce((max, item) => Math.max(max, item.ordem), 0) + 1;
    run(async () => {
      const created = await createItem({ ...draft, valor, ordem });
      setItems((current) => [...current, created]);
      setDraft((current) => ({ ...current, titulo: "", valor: "", detalhe: "" }));
      setSituacao("abertos");
    });
  }

  function startEdit(item) {
    setEditingId(item.id);
    setConfirmId(null);
    setParcelId(null);
    setEdit({
      tipo: item.tipo,
      titulo: item.titulo,
      valor: String(item.valor).replace(".", ","),
      categoria: item.categoria,
      prazo: item.prazo,
      detalhe: item.detalhe,
      ativo: item.ativo,
    });
  }

  function saveEdit(item) {
    const valor = parseMoney(edit.valor);
    if (!edit.titulo.trim() || valor == null) {
      setError("Informe um nome e um valor válido.");
      return;
    }
    run(async () => {
      const next = await updateItem(item.id, {
        tipo: edit.tipo,
        titulo: edit.titulo,
        valor,
        categoria: edit.categoria,
        prazo: edit.prazo,
        detalhe: edit.detalhe,
        ativo: edit.ativo !== false,
      });
      replaceItem(next);
      setEditingId(null);
    });
  }

  function toggleFeito(item) {
    const previous = item.feito;
    replaceItem({ ...item, feito: !previous });
    run(async () => {
      const next = await updateItem(item.id, { feito: !previous });
      replaceItem(next);
    });
  }

  function toggleAtivo(item) {
    run(async () => {
      const next = await updateItem(item.id, { ativo: !item.ativo });
      replaceItem(next);
    });
  }

  function remove(item) {
    if (confirmId !== item.id) {
      setConfirmId(item.id);
      return;
    }
    run(async () => {
      await deleteItem(item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
      setConfirmId(null);
    });
  }

  function parcelar(item) {
    const parts = Number(vezes);
    if (!item.prazo || !Number.isInteger(parts) || parts < 2 || parts > 36) {
      setError("Parcelar pede de 2 a 36 vezes e uma data.");
      return;
    }
    const values = splitCents(item.valor, parts);
    run(async () => {
      const created = [];
      for (let index = 0; index < parts; index += 1) {
        created.push(
          await createItem({
            tipo: "pagar",
            titulo: `${item.titulo} ${index + 1}/${parts}`,
            valor: values[index],
            categoria: item.categoria,
            prazo: addMonths(item.prazo, index),
            detalhe: item.detalhe,
            ordem: item.ordem + index,
          }),
        );
      }
      await deleteItem(item.id);
      setItems((current) => [...current.filter((row) => row.id !== item.id), ...created]);
      setParcelId(null);
    });
  }

  function saveMeta(id, raw) {
    const valor = parseMoney(raw);
    if (valor == null || valor <= 0) return;
    run(async () => {
      const next = await updateMeta(id, valor);
      setMetas((current) => current.map((meta) => (meta.id === id ? next : meta)));
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#d6ff4a] text-lg font-semibold text-zinc-950">K</span>
          <div>
            <p className="text-sm font-medium tracking-wide text-zinc-100">Kishiki</p>
            <p className="text-[11px] tracking-[0.22em] text-zinc-500">IT SOLUTIONS</p>
          </div>
        </div>
        <p className="text-xs text-zinc-500">{isCloud() ? "Supabase" : "Neste navegador"}</p>
      </header>

      <section className="mt-8">
        <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">O que entra, o que sai, e o que ainda falta vender.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Cada dívida, compra e meta dá para marcar, editar ou apagar. Contas de obrigações ficam de fora até você incluir.
        </p>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="A pagar" value={moneyText(totals.openPay)} hint="Em aberto, na conta" />
        <Stat label="Já pago" value={moneyText(totals.paid)} hint="Marcados como pagos" />
        <Stat label="Previsto fora dos sites" value={moneyText(totals.pendingOther)} hint="OLX, família, fechamentos" />
        <Stat label="Falta vender" value={moneyText(totals.falta)} hint="Se o resto previsto entrar" accent />
      </section>

      <section className="mt-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <p className="text-sm leading-6 text-zinc-300">
          Metas de site ainda em aberto: <span className="text-zinc-50">{moneyText(totals.pendingSites)}</span>. Se elas entrarem, ainda faltam{" "}
          <span className="text-[#d6ff4a]">{moneyText(totals.seMetasEntrarem)}</span>
          {" — "}
          {units(totals.seMetasEntrarem, sitePrice)} sites ou {units(totals.seMetasEntrarem, packagePrice)} pacotes.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <PriceField key={`site-${sitePrice}`} label="Site" defaultValue={sitePrice} onCommit={(value) => saveMeta("site", value)} />
          <PriceField key={`pacote-${packagePrice}`} label="Pacote" defaultValue={packagePrice} onCommit={(value) => saveMeta("pacote", value)} />
        </div>
      </section>

      <form onSubmit={submitNew} className="mt-6 rounded-3xl border border-white/10 bg-zinc-950 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-200">Novo lançamento</p>
          <div className="flex rounded-full bg-white/5 p-1">
            {[
              ["pagar", "A pagar"],
              ["receber", "A receber"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDraft((current) => ({ ...current, tipo: value }))}
                className={`rounded-full px-3 py-1.5 text-xs ${draft.tipo === value ? "bg-[#d6ff4a] text-zinc-950" : "text-zinc-400"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input
            value={draft.titulo}
            onChange={(event) => setDraft((current) => ({ ...current, titulo: event.target.value }))}
            placeholder="Nome"
            className="field lg:col-span-2"
          />
          <input
            value={draft.valor}
            onChange={(event) => setDraft((current) => ({ ...current, valor: event.target.value }))}
            inputMode="decimal"
            placeholder="0,00"
            className="field"
          />
          <select
            value={draft.categoria}
            onChange={(event) => setDraft((current) => ({ ...current, categoria: event.target.value }))}
            className="field"
          >
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={draft.prazo}
            onChange={(event) => setDraft((current) => ({ ...current, prazo: event.target.value }))}
            className="field"
          />
          <button
            type="submit"
            disabled={saving || !draft.titulo.trim() || parseMoney(draft.valor) == null}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#d6ff4a] px-4 py-3 text-sm font-medium text-zinc-950 disabled:opacity-40"
          >
            <Plus size={16} />
            Anotar
          </button>
        </div>
        <input
          value={draft.detalhe}
          onChange={(event) => setDraft((current) => ({ ...current, detalhe: event.target.value }))}
          placeholder="Detalhe, opcional"
          className="field mt-3 w-full"
        />
      </form>

      <div className="mt-6 flex flex-wrap gap-2">
        {[
          ["abertos", "Em aberto"],
          ["feitos", "Concluídos"],
          ["todos", "Todos"],
        ].map(([value, label]) => (
          <FilterButton key={value} active={situacao === value} onClick={() => setSituacao(value)}>
            {label}
          </FilterButton>
        ))}
        <span className="mx-1 hidden w-px bg-white/10 sm:block" />
        {[
          ["todos", "Tudo"],
          ["pagar", "A pagar"],
          ["receber", "A receber"],
        ].map(([value, label]) => (
          <FilterButton key={value} active={tipoFiltro === value} onClick={() => setTipoFiltro(value)}>
            {label}
          </FilterButton>
        ))}
      </div>

      {error ? <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      {loading ? <p className="mt-8 text-sm text-zinc-500">Carregando a planilha…</p> : null}

      {!loading && groups.length === 0 ? (
        <p className="mt-8 rounded-3xl border border-dashed border-white/15 px-5 py-10 text-center text-sm text-zinc-500">Nada neste filtro.</p>
      ) : null}

      <div className="mt-4 space-y-4">
        {groups.map((group) => {
          const openPay = group.items.filter((item) => item.ativo && item.tipo === "pagar" && !item.feito).reduce((sum, item) => sum + item.valor, 0);
          const late = group.key && daysFromToday(group.key) < 0 && openPay > 0;
          return (
            <section key={group.key || "sem-data"} className="overflow-hidden rounded-3xl border border-white/10">
              <div className="flex items-baseline justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
                <div>
                  <h2 className="text-sm font-medium text-zinc-100">{group.key ? formatDate(group.key) : "Sem dia"}</h2>
                  <p className={`text-xs ${late ? "text-rose-300" : "text-zinc-500"}`}>{whenLabel(group.key)}</p>
                </div>
                <p className="text-sm text-zinc-300">{moneyText(openPay)} em aberto</p>
              </div>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id} className={`border-t border-white/5 px-4 py-3 first:border-t-0 sm:px-5 ${item.ativo ? "" : "opacity-55"}`}>
                    {editingId === item.id ? (
                      <EditForm
                        edit={edit}
                        setEdit={setEdit}
                        onCancel={() => setEditingId(null)}
                        onSave={() => saveEdit(item)}
                        saving={saving}
                      />
                    ) : (
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          aria-label={item.feito ? "Desmarcar" : item.tipo === "pagar" ? "Marcar como pago" : "Marcar como recebido"}
                          onClick={() => toggleFeito(item)}
                          className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border ${item.feito ? "border-[#d6ff4a] bg-[#d6ff4a] text-zinc-950" : "border-white/20 text-transparent"}`}
                        >
                          <Check size={15} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <p className={`text-sm font-medium ${item.feito ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{item.titulo}</p>
                            <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                              {item.tipo === "pagar" ? "Pagar" : "Receber"} · {categoryLabel(item.categoria)}
                            </span>
                            {!item.ativo ? <span className="text-[11px] text-amber-200">Fora da conta</span> : null}
                          </div>
                          {item.detalhe ? <p className="mt-1 text-xs leading-5 text-zinc-500">{item.detalhe}</p> : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <TextButton onClick={() => startEdit(item)}>
                              <Pencil size={13} /> Editar
                            </TextButton>
                            <TextButton onClick={() => toggleAtivo(item)}>{item.ativo ? "Tirar da conta" : "Incluir na conta"}</TextButton>
                            {item.tipo === "pagar" && item.prazo && !item.feito ? (
                              <TextButton
                                onClick={() => {
                                  setParcelId(parcelId === item.id ? null : item.id);
                                  setVezes("12");
                                  setConfirmId(null);
                                }}
                              >
                                Parcelar
                              </TextButton>
                            ) : null}
                            <TextButton danger={confirmId === item.id} onClick={() => remove(item)}>
                              {confirmId === item.id ? (
                                "Excluir"
                              ) : (
                                <>
                                  <Trash2 size={13} /> Apagar
                                </>
                              )}
                            </TextButton>
                          </div>
                          {parcelId === item.id ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <input value={vezes} onChange={(event) => setVezes(event.target.value)} inputMode="numeric" className="field w-24" />
                              <span className="text-xs text-zinc-500">vezes a partir desta data</span>
                              <button type="button" onClick={() => parcelar(item)} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-950">
                                Gerar parcelas
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <p className={`shrink-0 text-sm font-medium ${item.tipo === "receber" ? "text-[#d6ff4a]" : "text-zinc-100"}`}>
                          {item.tipo === "receber" ? "+" : "−"} {moneyText(item.valor)}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function Stat({ label, value, hint, accent = false }) {
  return (
    <article className={`rounded-3xl border p-4 ${accent ? "border-[#d6ff4a]/40 bg-[#d6ff4a]/10" : "border-white/10 bg-white/[0.03]"}`}>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className={`mt-2 text-xl font-semibold tracking-tight ${accent ? "text-[#d6ff4a]" : "text-zinc-50"}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </article>
  );
}

function PriceField({ label, defaultValue, onCommit }) {
  const [value, setValue] = useState(String(defaultValue).replace(".", ","));
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-xs text-zinc-400">
      {label}
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onCommit(value)}
        inputMode="decimal"
        className="w-24 bg-transparent text-sm text-zinc-100 outline-none"
      />
    </label>
  );
}

function FilterButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs ${active ? "bg-white text-zinc-950" : "bg-white/5 text-zinc-400"}`}
    >
      {children}
    </button>
  );
}

function TextButton({ children, onClick, danger = false }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 text-xs ${danger ? "text-rose-300" : "text-zinc-400 hover:text-zinc-200"}`}>
      {children}
    </button>
  );
}

function EditForm({ edit, setEdit, onCancel, onSave, saving }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <select value={edit.tipo} onChange={(event) => setEdit((current) => ({ ...current, tipo: event.target.value }))} className="field">
          <option value="pagar">A pagar</option>
          <option value="receber">A receber</option>
        </select>
        <input value={edit.titulo} onChange={(event) => setEdit((current) => ({ ...current, titulo: event.target.value }))} className="field lg:col-span-2" />
        <input value={edit.valor} onChange={(event) => setEdit((current) => ({ ...current, valor: event.target.value }))} inputMode="decimal" className="field" />
        <select value={edit.categoria} onChange={(event) => setEdit((current) => ({ ...current, categoria: event.target.value }))} className="field">
          {CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <input type="date" value={edit.prazo} onChange={(event) => setEdit((current) => ({ ...current, prazo: event.target.value }))} className="field" />
        <input value={edit.detalhe} onChange={(event) => setEdit((current) => ({ ...current, detalhe: event.target.value }))} placeholder="Detalhe" className="field" />
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-400">
        <input type="checkbox" checked={edit.ativo !== false} onChange={(event) => setEdit((current) => ({ ...current, ativo: event.target.checked }))} />
        Entra na conta
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onSave} disabled={saving} className="rounded-full bg-[#d6ff4a] px-4 py-2 text-xs font-medium text-zinc-950">
          Salvar
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs text-zinc-400">
          <X size={13} /> Cancelar
        </button>
      </div>
    </div>
  );
}
