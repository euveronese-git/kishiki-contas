import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, Plus, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { categoriesFor, defaultCategory } from "./lib/categories.js";
import { createEvent, createItem, createTask, explainError } from "./lib/db.js";
import { fromDatetimeLocal, parseMoney } from "./ui.jsx";

const ACTIONS = [
  ["conta", "Nova conta", Wallet],
  ["atividade", "Nova atividade", Plus],
  ["evento", "Novo evento", CalendarPlus],
];

const emptyConta = { tipo: "pagar", titulo: "", valor: "", categoria: "dividas", prazo: "" };
const emptyTask = { titulo: "", descricao: "", prazo: "", valor: "" };
const emptyEvent = { titulo: "", descricao: "", inicio: "", valor: "" };

export default function CommandPalette({ onItem, onAgenda }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("menu");
  const [conta, setConta] = useState(emptyConta);
  const [task, setTask] = useState(emptyTask);
  const [event, setEvent] = useState(emptyEvent);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(press) {
      if ((press.metaKey || press.ctrlKey) && press.key.toLowerCase() === "k") {
        press.preventDefault();
        setOpen((current) => !current);
        setMode("menu");
        setError("");
      } else if (press.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function close() {
    setOpen(false);
    setMode("menu");
    setError("");
  }

  async function save(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      close();
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  function submitConta(submit) {
    submit.preventDefault();
    const valor = parseMoney(conta.valor);
    if (!conta.titulo.trim() || valor == null || valor < 0) return;
    save(async () => {
      const created = await createItem({ ...conta, valor, detalhe: "", ativo: true, feito: false, ordem: 0 });
      setConta(emptyConta);
      onItem(created);
    });
  }

  function submitTask(submit) {
    submit.preventDefault();
    const valor = task.valor.trim() ? parseMoney(task.valor) : null;
    if (!task.titulo.trim() || (task.valor.trim() && (valor == null || valor < 0))) return;
    save(async () => {
      await createTask({ ...task, valor: task.valor.trim() ? valor : "" });
      setTask(emptyTask);
      onAgenda();
    });
  }

  function submitEvent(submit) {
    submit.preventDefault();
    const valor = event.valor.trim() ? parseMoney(event.valor) : null;
    if (!event.titulo.trim() || !event.inicio || (event.valor.trim() && (valor == null || valor < 0))) return;
    save(async () => {
      await createEvent({ ...event, inicio: fromDatetimeLocal(event.inicio), valor: event.valor.trim() ? valor : "" });
      setEvent(emptyEvent);
      onAgenda();
    });
  }

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div className="fixed inset-0 z-40 grid place-items-end bg-black/50 p-3 sm:place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
            <motion.div role="dialog" aria-label="Ações rápidas" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ type: "spring", stiffness: 420, damping: 34 }} onClick={(press) => press.stopPropagation()} className="glass w-full max-w-lg rounded-3xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-100">{mode === "menu" ? "O que você quer anotar?" : ACTIONS.find(([id]) => id === mode)?.[1]}</p>
                <p className="text-[11px] text-zinc-500">Ctrl K</p>
              </div>
              {mode === "menu" ? (
                <div className="mt-4 grid gap-2">
                  {ACTIONS.map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => { setMode(id); setError(""); }} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left text-sm text-zinc-100 hover:border-[var(--accent)]/40">
                      <Icon size={16} className="text-[var(--accent)]" />
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              {mode === "conta" ? (
                <form onSubmit={submitConta} className="mt-4 grid gap-3">
                  <div className="flex gap-2">
                    {[["pagar", "A pagar"], ["receber", "A receber"]].map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setConta((current) => ({ ...current, tipo: id, categoria: defaultCategory(id) }))} className={`rounded-full px-3 py-1.5 text-xs ${conta.tipo === id ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-white/5 text-zinc-400"}`}>{label}</button>
                    ))}
                  </div>
                  <input value={conta.titulo} onChange={(input) => setConta({ ...conta, titulo: input.target.value })} placeholder="Nome" className="field" />
                  <input value={conta.valor} onChange={(input) => setConta({ ...conta, valor: input.target.value })} inputMode="decimal" placeholder="0,00" className="field tabular" />
                  <select value={conta.categoria} onChange={(input) => setConta({ ...conta, categoria: input.target.value })} className="field">
                    {categoriesFor(conta.tipo).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  <input type="date" value={conta.prazo} onChange={(input) => setConta({ ...conta, prazo: input.target.value })} className="field" />
                  <FormActions busy={busy} back={() => setMode("menu")} />
                </form>
              ) : null}
              {mode === "atividade" ? (
                <form onSubmit={submitTask} className="mt-4 grid gap-3">
                  <input value={task.titulo} onChange={(input) => setTask({ ...task, titulo: input.target.value })} placeholder="O que fazer" className="field" />
                  <textarea value={task.descricao} onChange={(input) => setTask({ ...task, descricao: input.target.value })} placeholder="Descrição" className="field min-h-20" />
                  <input type="date" value={task.prazo} onChange={(input) => setTask({ ...task, prazo: input.target.value })} className="field" />
                  <input value={task.valor} onChange={(input) => setTask({ ...task, valor: input.target.value })} inputMode="decimal" placeholder="Valor, opcional" className="field tabular" />
                  <FormActions busy={busy} back={() => setMode("menu")} />
                </form>
              ) : null}
              {mode === "evento" ? (
                <form onSubmit={submitEvent} className="mt-4 grid gap-3">
                  <input value={event.titulo} onChange={(input) => setEvent({ ...event, titulo: input.target.value })} placeholder="Evento" className="field" />
                  <textarea value={event.descricao} onChange={(input) => setEvent({ ...event, descricao: input.target.value })} placeholder="Descrição" className="field min-h-20" />
                  <input type="datetime-local" value={event.inicio} onChange={(input) => setEvent({ ...event, inicio: input.target.value })} className="field" />
                  <input value={event.valor} onChange={(input) => setEvent({ ...event, valor: input.target.value })} inputMode="decimal" placeholder="Valor, opcional" className="field tabular" />
                  <FormActions busy={busy} back={() => setMode("menu")} />
                </form>
              ) : null}
              {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function FormActions({ busy, back }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={back} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-zinc-300">Voltar</button>
      <button type="submit" disabled={busy} className="flex-1 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[var(--bg)] disabled:opacity-40">Salvar</button>
    </div>
  );
}
