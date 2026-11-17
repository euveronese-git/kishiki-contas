import { Check, Inbox, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Arvore, chavesDeHoje, chavesDoDia, montarArvore } from "./Arvore.jsx";
import { createEvent, createItem, createTask, deleteEvent, deleteTask, explainError, listAgenda, updateEvent, updateTask } from "./lib/db.js";
import { abrirIa } from "./lib/ia.js";
import { formatDate, formatWhen, fromDatetimeLocal, moneyText, parseMoney, todayISO } from "./ui.jsx";

export default function Agenda({ revision = 0, onItem, meuId = "", pedido = 0 }) {
  const [atividades, setAtividades] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("atividade");
  const [alsoConta, setAlsoConta] = useState(false);
  const [abertoId, setAbertoId] = useState("");
  const [abertos, setAbertos] = useState(() => new Set(chavesDeHoje()));
  const [mes, setMes] = useState(() => todayISO().slice(0, 7));
  const [taskTried, setTaskTried] = useState(false);
  const [draft, setDraft] = useState(emptyDraft("atividade"));

  useEffect(() => {
    let alive = true;
    listAgenda()
      .then((data) => {
        if (!alive) return;
        setAtividades(data.atividades);
        setEventos(data.eventos);
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
  }, [revision]);

  useEffect(() => {
    if (pedido > 0) setOpen(true);
  }, [pedido]);

  const entradas = useMemo(() => entradasAgenda(atividades, eventos), [atividades, eventos]);
  const arvore = useMemo(() => montarArvore(entradas), [entradas]);
  const marcados = useMemo(() => new Set(entradas.map((row) => row.iso).filter((iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso))), [entradas]);

  function abrirDia(iso) {
    setMes(iso.slice(0, 7));
    setAbertos((atual) => {
      const next = new Set(atual);
      for (const chave of chavesDoDia(iso)) next.add(chave);
      return next;
    });
    window.setTimeout(() => document.getElementById(`periodo-${iso}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 220);
  }

  async function run(action) {
    setError("");
    try {
      await action();
    } catch (err) {
      setError(explainError(err));
    }
  }

  function submit(event) {
    event.preventDefault();
    setTaskTried(true);
    const valor = draft.valor.trim() ? parseMoney(draft.valor) : null;
    const invalidMoney = draft.valor.trim() && (valor == null || valor < 0);
    if (!draft.titulo.trim() || invalidMoney) return;
    if (kind === "evento" && !draft.inicio) return;
    run(async () => {
      if (kind === "atividade") {
        const created = await createTask({ ...draft, valor: draft.valor.trim() ? valor : "" });
        setAtividades((current) => [...current, created]);
        if (alsoConta && valor != null) onItem?.(await createItem(contaFrom(draft, valor, "pagar")));
      } else {
        const created = await createEvent({ ...draft, inicio: fromDatetimeLocal(draft.inicio), valor: draft.valor.trim() ? valor : "" });
        setEventos((current) => [...current, created].sort((a, b) => a.inicio.localeCompare(b.inicio)));
        if (alsoConta && valor != null) onItem?.(await createItem(contaFrom(draft, valor, "pagar")));
      }
      setDraft(emptyDraft(kind));
      setAlsoConta(false);
      setTaskTried(false);
      setOpen(false);
    });
  }

  function alheio(item) {
    return Boolean(meuId && item.user_id && item.user_id !== meuId);
  }

  function toggleTask(item) {
    if (alheio(item)) return;
    run(async () => {
      const next = await updateTask(item.id, { feito: !item.feito });
      setAtividades((current) => current.map((row) => (row.id === item.id ? next : row)));
    });
  }

  function toggleEvent(item) {
    if (alheio(item)) return;
    run(async () => {
      const next = await updateEvent(item.id, { feito: !item.feito });
      setEventos((current) => current.map((row) => (row.id === item.id ? next : row)));
    });
  }

  return (
    <div className="grid gap-6">
      {error ? <p className="rounded-[12px] border border-[var(--out)]/30 bg-[var(--out)]/10 px-4 py-3 text-sm text-[var(--out)]">{error}</p> : null}
      <div>
        <button type="button" onClick={() => abrirIa("lancar")} className="h-9 rounded-full px-3 text-xs text-[var(--muted)]">IA Veronese</button>
      </div>

      {loading ? <div className="h-24 animate-pulse rounded-[20px] bg-white/5" /> : <MesMini mes={mes} marcados={marcados} onMes={setMes} onDia={abrirDia} />}
      {!loading && arvore.years.length === 0 && arvore.loose.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-white/15 px-5 py-10 text-center">
          <Inbox className="mx-auto text-[var(--muted)]" size={28} />
          <p className="mt-3 text-sm text-[var(--muted)]">Nada anotado ainda.</p>
        </div>
      ) : null}
      {!loading ? (
        <Arvore
          arvore={arvore}
          abertos={abertos}
          alternar={(id) => setAbertos((atual) => {
            const next = new Set(atual);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })}
          resumo={resumoAgenda}
          badgeDia={badgeAgenda}
          renderDia={(rows) => (
            <ul className="space-y-2">
              {rows.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3 rounded-[12px] border border-[var(--line)] px-3 py-2">
                  <button type="button" aria-label={item.feito ? "Desmarcar" : "Concluir"} onClick={() => (item.kind === "atividade" ? toggleTask(item) : toggleEvent(item))} className={`mt-0.5 grid size-11 shrink-0 place-items-center rounded-full border ${item.feito ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]" : item.late ? "border-[var(--warn)] text-transparent" : "border-white/20 text-transparent"}`}>
                    <Check size={15} />
                  </button>
                  <button type="button" onClick={() => setAbertoId(abertoId === `${item.kind}-${item.id}` ? "" : `${item.kind}-${item.id}`)} className="min-w-0 flex-1 text-left">
                    <p className={`text-sm ${item.feito ? "text-[var(--disabled)] line-through" : "text-[var(--text)]"}`}>{item.titulo}</p>
                    <p className="text-xs text-[var(--muted)]">{item.kind === "atividade" ? "Atividade" : "Evento"} · {item.when}{item.valor !== "" && item.valor != null ? ` · ${moneyText(item.valor)}` : ""}{item.late ? " · Atrasada" : ""}</p>
                  </button>
                  {alheio(item) || abertoId !== `${item.kind}-${item.id}` ? null : (
                    <button type="button" aria-label="Apagar" onClick={() => run(async () => {
                      if (item.kind === "atividade") {
                        await deleteTask(item.id);
                        setAtividades((current) => current.filter((row) => row.id !== item.id));
                      } else {
                        await deleteEvent(item.id);
                        setEventos((current) => current.filter((row) => row.id !== item.id));
                      }
                    })} className="grid size-11 place-items-center text-[var(--muted)] hover:text-[var(--out)]">
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        />
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/50 p-3 sm:place-items-center" onClick={() => setOpen(false)}>
          <form onClick={(event) => event.stopPropagation()} onSubmit={submit} className="glass w-full max-w-lg p-4 sm:p-5">
            <p className="text-sm font-medium text-[var(--text)]">Novo</p>
            <div className="mt-3 flex gap-2">
              {[["atividade", "Atividade"], ["evento", "Evento"]].map(([id, label]) => (
                <button key={id} type="button" onClick={() => { setKind(id); setDraft(emptyDraft(id)); }} className={`h-11 rounded-full px-4 text-sm ${kind === id ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-white/5 text-[var(--muted)]"}`}>{label}</button>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              <input value={draft.titulo} onChange={(event) => setDraft({ ...draft, titulo: event.target.value })} placeholder="Título" className={`field ${taskTried && !draft.titulo.trim() ? "field-bad" : ""}`} />
              <textarea value={draft.descricao} onChange={(event) => setDraft({ ...draft, descricao: event.target.value })} placeholder="Descrição" className="field min-h-20" />
              {kind === "atividade" ? (
                <input type="date" value={draft.prazo} onChange={(event) => setDraft({ ...draft, prazo: event.target.value })} className="field" />
              ) : (
                <input type="datetime-local" value={draft.inicio} onChange={(event) => setDraft({ ...draft, inicio: event.target.value })} className={`field ${taskTried && !draft.inicio ? "field-bad" : ""}`} />
              )}
              <input value={draft.valor} onChange={(event) => setDraft({ ...draft, valor: event.target.value })} inputMode="decimal" placeholder="Valor, opcional" className="field tabular" />
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={alsoConta} onChange={(event) => setAlsoConta(event.target.checked)} />
                Também lançar em Contas
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-[12px] border border-[var(--line)] px-4 text-sm text-[var(--muted)]">Cancelar</button>
                <button type="submit" className="h-11 flex-1 rounded-[12px] bg-[var(--accent)] text-sm font-medium text-[var(--bg)]">Salvar</button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function MesMini({ mes, marcados, onMes, onDia }) {
  const [year, month] = mes.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const pad = (first.getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  const cells = [...Array(pad).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  const titulo = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(first);
  const today = todayISO();
  function shift(delta) {
    const next = new Date(year, month - 1 + delta, 1);
    onMes(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }
  return (
    <section className="rounded-3xl border border-white/10 p-3" aria-label="Calendário">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Mês anterior" onClick={() => shift(-1)} className="h-11 px-3 text-sm text-[var(--muted)]">‹</button>
        <p className="text-sm capitalize text-[var(--text)]">{titulo}</p>
        <button type="button" aria-label="Próximo mês" onClick={() => shift(1)} className="h-11 px-3 text-sm text-[var(--muted)]">›</button>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-[12px] text-[var(--muted)]">
        {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7">
        {cells.map((day, index) => {
          if (!day) return <span key={`vazio-${index}`} />;
          const iso = `${mes}-${String(day).padStart(2, "0")}`;
          const tem = marcados.has(iso);
          return (
            <button key={iso} type="button" disabled={!tem} onClick={() => onDia(iso)} className={`relative mx-auto grid size-9 place-items-center rounded-full text-xs ${iso === today ? "text-[var(--accent)]" : tem ? "text-[var(--text)]" : "text-[var(--disabled)]"}`}>
              {day}
              {tem ? <span className="absolute bottom-0.5 size-1 rounded-full bg-[var(--accent)]" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function emptyDraft(kind) {
  return kind === "evento"
    ? { titulo: "", descricao: "", inicio: "", valor: "" }
    : { titulo: "", descricao: "", prazo: "", valor: "" };
}

function contaFrom(draft, valor, tipo) {
  return {
    tipo,
    titulo: draft.titulo,
    valor,
    categoria: "outro",
    prazo: draft.prazo || (draft.inicio ? draft.inicio.slice(0, 10) : ""),
    detalhe: "Veio da agenda",
    ativo: true,
    feito: false,
    ordem: 0,
  };
}

function entradasAgenda(atividades, eventos) {
  const today = todayISO();
  const tarefas = atividades.map((item) => ({
    iso: item.prazo || "",
    item: { ...item, kind: "atividade", when: item.prazo ? formatDate(item.prazo) : "Sem dia", late: Boolean(item.prazo && item.prazo < today && !item.feito) },
  }));
  const marcados = eventos.map((item) => ({
    iso: saoPauloDate(item.inicio),
    item: { ...item, kind: "evento", when: formatWhen(item.inicio), late: false },
  }));
  return [...tarefas, ...marcados];
}

function resumoAgenda(rows) {
  const total = rows.length;
  return <span className="text-xs text-[var(--muted)]">{total} {total === 1 ? "item" : "itens"}</span>;
}

function badgeAgenda(iso, rows) {
  if (iso === todayISO()) return <span className="shrink-0 rounded-full bg-[var(--accent)] px-2 py-1 text-xs text-[var(--bg)]">Hoje</span>;
  if (iso < todayISO() && rows.some((item) => !item.feito)) return <span className="shrink-0 rounded-full bg-[var(--warn)]/15 px-2 py-1 text-xs text-[var(--warn)]">Atrasado</span>;
  return null;
}

function saoPauloDate(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

