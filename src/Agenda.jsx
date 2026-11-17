import { Check, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createEvent, createTask, deleteEvent, deleteTask, explainError, listAgenda, updateEvent, updateTask } from "./lib/db.js";
import { formatDate, formatWhen, fromDatetimeLocal, moneyText, parseMoney, toDatetimeLocal } from "./ui.jsx";

export default function Agenda() {
  const [atividades, setAtividades] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState({ titulo: "", descricao: "", prazo: "", valor: "" });
  const [event, setEvent] = useState({ titulo: "", descricao: "", inicio: "", valor: "" });

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
  }, []);

  async function run(action) {
    setError("");
    try {
      await action();
    } catch (err) {
      setError(explainError(err));
    }
  }

  function addTask(submit) {
    submit.preventDefault();
    const valor = task.valor.trim() ? parseMoney(task.valor) : null;
    if (!task.titulo.trim() || (task.valor.trim() && (valor == null || valor < 0))) return;
    run(async () => {
      const created = await createTask({ ...task, valor: task.valor.trim() ? valor : "" });
      setAtividades((current) => [...current, created]);
      setTask({ titulo: "", descricao: "", prazo: "", valor: "" });
    });
  }

  function addEvent(submit) {
    submit.preventDefault();
    const valor = event.valor.trim() ? parseMoney(event.valor) : null;
    if (!event.titulo.trim() || !event.inicio || (event.valor.trim() && (valor == null || valor < 0))) return;
    run(async () => {
      const created = await createEvent({ ...event, inicio: fromDatetimeLocal(event.inicio), valor: event.valor.trim() ? valor : "" });
      setEventos((current) => [...current, created].sort((a, b) => a.inicio.localeCompare(b.inicio)));
      setEvent({ titulo: "", descricao: "", inicio: "", valor: "" });
    });
  }

  const openTasks = [...atividades].sort((a, b) => Number(a.feito) - Number(b.feito) || (a.prazo || "9999").localeCompare(b.prazo || "9999"));

  function toggleTask(item) {
    run(async () => {
      const next = await updateTask(item.id, { feito: !item.feito });
      setAtividades((current) => current.map((row) => (row.id === item.id ? next : row)));
    });
  }

  function toggleEvent(item) {
    run(async () => {
      const next = await updateEvent(item.id, { feito: !item.feito });
      setEventos((current) => current.map((row) => (row.id === item.id ? next : row)));
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {error ? <p className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200 lg:col-span-2">{error}</p> : null}
      <section className="rounded-3xl border border-white/10 p-4 sm:p-5">
        <h2 className="text-sm font-medium text-zinc-100">Atividades</h2>
        <p className="mt-1 text-xs text-zinc-500">O que precisa ser feito, com prazo e valor se fizer sentido.</p>
        <form onSubmit={addTask} className="mt-4 grid gap-3">
          <input value={task.titulo} onChange={(e) => setTask({ ...task, titulo: e.target.value })} placeholder="O que fazer" className="field" />
          <textarea value={task.descricao} onChange={(e) => setTask({ ...task, descricao: e.target.value })} placeholder="Descrição" className="field min-h-20" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="date" value={task.prazo} onChange={(e) => setTask({ ...task, prazo: e.target.value })} className="field" />
            <input value={task.valor} onChange={(e) => setTask({ ...task, valor: e.target.value })} inputMode="decimal" placeholder="Valor, opcional" className="field" />
          </div>
          <button type="submit" className="rounded-2xl bg-[#d6ff4a] px-4 py-3 text-sm font-medium text-zinc-950">Anotar atividade</button>
        </form>
        {loading ? <p className="mt-4 text-sm text-zinc-500">Carregando…</p> : null}
        <ul className="mt-4 space-y-3">
          {openTasks.map((item) => (
            <li key={item.id} className="rounded-2xl border border-white/10 px-3 py-3">
              <div className="flex items-start gap-3">
                <button type="button" aria-label={item.feito ? "Desmarcar" : "Concluir"} onClick={() => toggleTask(item)} className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border ${item.feito ? "border-[#d6ff4a] bg-[#d6ff4a] text-zinc-950" : "border-white/20 text-transparent"}`}>
                  <Check size={15} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${item.feito ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{item.titulo}</p>
                  {item.descricao ? <p className="mt-1 text-xs leading-5 text-zinc-500">{item.descricao}</p> : null}
                  <p className="mt-1 text-xs text-zinc-400">{item.prazo ? formatDate(item.prazo) : "Sem dia"}{item.valor !== "" ? ` · ${moneyText(item.valor)}` : ""}</p>
                </div>
                <button type="button" aria-label="Apagar" onClick={() => run(async () => { await deleteTask(item.id); setAtividades((current) => current.filter((row) => row.id !== item.id)); })} className="text-zinc-500 hover:text-rose-300">
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-white/10 p-4 sm:p-5">
        <h2 className="text-sm font-medium text-zinc-100">Agenda</h2>
        <p className="mt-1 text-xs text-zinc-500">Eventos com horário, descrição e valor se houver.</p>
        <form onSubmit={addEvent} className="mt-4 grid gap-3">
          <input value={event.titulo} onChange={(e) => setEvent({ ...event, titulo: e.target.value })} placeholder="Evento" className="field" />
          <textarea value={event.descricao} onChange={(e) => setEvent({ ...event, descricao: e.target.value })} placeholder="Descrição" className="field min-h-20" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="datetime-local" value={event.inicio} onChange={(e) => setEvent({ ...event, inicio: e.target.value })} className="field" />
            <input value={event.valor} onChange={(e) => setEvent({ ...event, valor: e.target.value })} inputMode="decimal" placeholder="Valor, opcional" className="field" />
          </div>
          <button type="submit" className="rounded-2xl bg-[#d6ff4a] px-4 py-3 text-sm font-medium text-zinc-950">Anotar evento</button>
        </form>
        <ul className="mt-4 space-y-3">
          {[...eventos].sort((a, b) => a.inicio.localeCompare(b.inicio)).map((item) => (
            <li key={item.id} className="rounded-2xl border border-white/10 px-3 py-3">
              <div className="flex items-start gap-3">
                <button type="button" aria-label={item.feito ? "Desmarcar" : "Concluir"} onClick={() => toggleEvent(item)} className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border ${item.feito ? "border-[#d6ff4a] bg-[#d6ff4a] text-zinc-950" : "border-white/20 text-transparent"}`}>
                  <Check size={15} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${item.feito ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{item.titulo}</p>
                  {item.descricao ? <p className="mt-1 text-xs leading-5 text-zinc-500">{item.descricao}</p> : null}
                  <p className="mt-1 text-xs text-zinc-400">{formatWhen(item.inicio)}{item.valor !== "" ? ` · ${moneyText(item.valor)}` : ""}</p>
                  <input
                    type="datetime-local"
                    defaultValue={toDatetimeLocal(item.inicio)}
                    onBlur={(input) => {
                      const inicio = fromDatetimeLocal(input.target.value);
                      if (!inicio || inicio === item.inicio) return;
                      run(async () => {
                        const next = await updateEvent(item.id, { inicio });
                        setEventos((current) => current.map((row) => (row.id === item.id ? next : row)));
                      });
                    }}
                    className="field mt-2"
                  />
                </div>
                <button type="button" aria-label="Apagar" onClick={() => run(async () => { await deleteEvent(item.id); setEventos((current) => current.filter((row) => row.id !== item.id)); })} className="text-zinc-500 hover:text-rose-300">
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

