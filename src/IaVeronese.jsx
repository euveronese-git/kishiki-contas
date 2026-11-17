import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { categoriesFor } from "./lib/categories.js";
import { createEvent, createItem, createTask, explainError, updateEvent, updateTask } from "./lib/db.js";
import { parseMoney } from "./ui.jsx";
import { abrirIa, chamarIa, lerResumo, mensagemIa, mesAtual, usosDeHoje } from "./lib/ia.js";

const AVISO = "Os textos são processados pelo Google Gemini. Não digite CPF ou senhas.";

export default function IaVeronese({ onItem, onAgenda }) {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState("lancar");
  const [texto, setTexto] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");
  const [itens, setItens] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usos, setUsos] = useState(null);
  const [limite, setLimite] = useState(20);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setModo("lancar");
        setOpen(true);
      }
    };
    const onOpen = (event) => {
      setModo(event.detail?.modo || "lancar");
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("casa-ia", onOpen);
    usosDeHoje().then((count) => setUsos(count));
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("casa-ia", onOpen);
    };
  }, []);

  function fail(err) {
    setError(mensagemIa(err));
  }

  async function interpretar(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setItens(null);
    try {
      const data = await chamarIa("ai-parse", { texto });
      setItens((data.itens || []).map(preparar));
      if (data.usos != null) setUsos(data.usos);
      if (data.limite) setLimite(data.limite);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function perguntar(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResposta("");
    try {
      const data = await chamarIa("ai-ask", { pergunta });
      setResposta(data.resposta || "");
      if (data.usos != null) setUsos(data.usos);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function confirmar() {
    const prontos = [];
    for (const item of itens || []) {
      if (!item.titulo.trim()) continue;
      if (item.tipo === "conta") {
        const valor = parseMoney(item.valor);
        if (valor == null || valor <= 0) {
          setError("Falta o valor de um lançamento. Preencha ou apague a linha.");
          return;
        }
        prontos.push({ ...item, valor });
      } else if (item.tipo === "evento" && !item.data) {
        setError("O evento precisa de uma data.");
        return;
      } else {
        prontos.push({ ...item, valor: item.valor ? parseMoney(item.valor) : "" });
      }
    }
    setBusy(true);
    setError("");
    let teveConta = false;
    let teveAgenda = false;
    try {
      for (const item of prontos) {
        if (item.tipo === "conta") {
          const categoria = categoriaPronta(item);
          onItem?.(await createItem({
            tipo: item.direcao,
            titulo: item.titulo,
            valor: item.valor,
            categoria: categoria.id,
            prazo: item.data || "",
            detalhe: categoria.detalhe || "",
            feito: item.pago,
            ativo: true,
          }));
          teveConta = true;
        } else if (item.tipo === "atividade") {
          const created = await createTask({ titulo: item.titulo, prazo: item.data || "", valor: item.valor, descricao: item.duvida || "" });
          if (item.pago) await updateTask(created.id, { feito: true });
          teveAgenda = true;
        } else {
          const created = await createEvent({ titulo: item.titulo, inicio: `${item.data}T${item.hora || "09:00"}:00-03:00`, valor: item.valor, descricao: item.duvida || "" });
          if (item.pago) await updateEvent(created.id, { feito: true });
          teveAgenda = true;
        }
      }
      if (teveAgenda) onAgenda?.(!teveConta);
      setItens(null);
      setTexto("");
      setOpen(false);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/55 p-3 sm:place-items-center" onClick={() => setOpen(false)}>
          <section onClick={(event) => event.stopPropagation()} className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto p-4 sm:p-5" role="dialog" aria-labelledby="ia-titulo">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="ia-titulo" className="text-sm font-medium text-[var(--text)]">IA Veronese</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{AVISO}</p>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="grid size-11 place-items-center text-[var(--muted)]"><X size={16} /></button>
            </div>
            <div className="mt-3 flex gap-2">
              {[["lancar", "Lançar"], ["perguntar", "Pergunte à Casa"], ["resumo", "Resumo"]].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setModo(id)} className={`h-11 rounded-full px-3 text-xs ${modo === id ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-white/5 text-[var(--muted)]"}`}>{label}</button>
              ))}
            </div>
            {usos != null ? <p className="mt-3 text-xs text-[var(--muted)]">{usos} de {limite} usos hoje</p> : null}
            {error ? <p className="mt-3 text-sm text-[var(--warn)]" role="alert">{error}</p> : null}

            {modo === "lancar" && !itens ? (
              <form onSubmit={interpretar} className="mt-4 grid gap-3">
                <label className="text-xs text-[var(--muted)]" htmlFor="ia-texto">Uma frase ou até 10 linhas. Isso conta como 1 uso.</label>
                <textarea id="ia-texto" value={texto} onChange={(event) => setTexto(event.target.value)} rows={4} maxLength={2000} className="field" placeholder="Ex.: luz 180 reais dia 20, e dentista sexta 15h" />
                <button type="submit" disabled={busy || !texto.trim()} className="h-11 rounded-[12px] bg-[var(--accent)] text-sm font-medium text-[var(--bg)] disabled:opacity-40">{busy ? "Lendo..." : "Conferir"}</button>
                <p className="text-xs text-[var(--disabled)]">Atalho Ctrl+J. Nada é gravado antes de você confirmar.</p>
              </form>
            ) : null}

            {modo === "lancar" && itens ? (
              <div className="mt-4 grid gap-3">
                {itens.map((item, index) => (
                  <Item key={index} item={item} onChange={(next) => setItens((current) => current.map((row, rowIndex) => (rowIndex === index ? next : row)))} />
                ))}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={confirmar} className="h-11 rounded-[12px] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--bg)] disabled:opacity-40">Confirmar</button>
                  <button type="button" onClick={() => setItens(null)} className="h-11 rounded-[12px] border border-[var(--line)] px-4 text-sm text-[var(--text)]">Editar texto</button>
                  <button type="button" onClick={() => { setItens(null); setOpen(false); }} className="h-11 rounded-[12px] px-4 text-sm text-[var(--muted)]">Cancelar</button>
                </div>
              </div>
            ) : null}

            {modo === "perguntar" ? (
              <form onSubmit={perguntar} className="mt-4 grid gap-3">
                <label className="text-xs text-[var(--muted)]" htmlFor="ia-pergunta">Pergunte só sobre as suas contas e a sua agenda.</label>
                <textarea id="ia-pergunta" value={pergunta} onChange={(event) => setPergunta(event.target.value)} rows={3} maxLength={500} className="field" placeholder="Quanto falta pagar este mês?" />
                <button type="submit" disabled={busy || !pergunta.trim()} className="h-11 rounded-[12px] bg-[var(--accent)] text-sm font-medium text-[var(--bg)] disabled:opacity-40">{busy ? "Somando..." : "Perguntar"}</button>
                {resposta ? (
                  <div aria-live="polite">
                    <p className="text-sm leading-6 text-[var(--text)]">{resposta}</p>
                    <p className="mt-2 text-xs text-[var(--warn)]">Gerado por IA, confira os valores na lista.</p>
                  </div>
                ) : null}
              </form>
            ) : null}

            {modo === "resumo" ? <ResumoMes /> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

export function ResumoMes() {
  const [resumo, setResumo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    lerResumo().then((data) => {
      if (alive) setResumo(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function atualizar() {
    setBusy(true);
    setError("");
    try {
      const data = await chamarIa("ai-summary", { atualizar: true });
      setResumo({ texto: data.texto, criadoEm: data.criadoEm, ausente: false });
    } catch (err) {
      setError(mensagemIa(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-[20px] border border-[var(--line)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--text)]">Resumo de {mesAtual()}</p>
        <button type="button" onClick={atualizar} disabled={busy} className="h-11 rounded-full border border-[var(--line)] px-4 text-xs text-[var(--text)] disabled:opacity-40">{busy ? "Gerando..." : "Atualizar"}</button>
      </div>
      {error ? <p className="mt-3 text-sm text-[var(--warn)]">{error}</p> : null}
      {!resumo ? <p className="mt-3 text-sm text-[var(--muted)]">Lendo...</p> : null}
      {resumo?.ausente ? <p className="mt-3 text-sm text-[var(--muted)]">O resumo fica disponível depois que a tabela da IA existir no banco.</p> : null}
      {resumo && !resumo.ausente && !resumo.texto ? <p className="mt-3 text-sm text-[var(--muted)]">Ainda não há um resumo deste mês. Atualizar gasta 1 uso.</p> : null}
      {resumo?.texto ? (
        <div className="mt-3" aria-live="polite">
          <p className="text-sm leading-6 text-[var(--text)]">{resumo.texto}</p>
          {resumo.criadoEm ? <p className="mt-2 text-xs text-[var(--disabled)]">Gerado em {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(resumo.criadoEm))}</p> : null}
          <p className="mt-2 text-xs text-[var(--warn)]">Gerado por IA, confira os valores na lista.</p>
        </div>
      ) : null}
    </section>
  );
}

function Item({ item, onChange }) {
  const baixa = item.confianca < 0.6 || item.valor == null;
  const set = (patch) => onChange({ ...item, ...patch });
  return (
    <div className={`grid gap-2 rounded-[12px] border p-3 ${baixa ? "border-[var(--warn)]/50" : "border-[var(--line)]"}`}>
      <div className="flex gap-2">
        {[["conta", "Conta"], ["atividade", "Atividade"], ["evento", "Evento"]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => set({ tipo: id })} className={`h-9 rounded-full px-3 text-xs ${item.tipo === id ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-white/5 text-[var(--muted)]"}`}>{label}</button>
        ))}
      </div>
      <input value={item.titulo} onChange={(event) => set({ titulo: event.target.value })} className="field" aria-label="Título" />
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={item.valor ?? ""} onChange={(event) => set({ valor: event.target.value })} inputMode="decimal" placeholder={baixa ? "Valor em aberto" : "0,00"} className="field" aria-label="Valor" />
        <input type="date" value={item.data || ""} onChange={(event) => set({ data: event.target.value })} className="field" aria-label="Data" />
      </div>
      {item.tipo === "conta" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={item.direcao} onChange={(event) => set({ direcao: event.target.value })} className="field" aria-label="Direção">
            <option value="pagar">Pagar</option>
            <option value="receber">Receber</option>
          </select>
          <select value={categoriaId(item)} onChange={(event) => set({ categoria: event.target.value })} className="field" aria-label="Categoria">
            {categoriesFor(item.direcao).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
      ) : null}
      {item.tipo === "evento" ? <input type="time" value={item.hora || ""} onChange={(event) => set({ hora: event.target.value })} className="field" aria-label="Hora" /> : null}
      {item.duvida || baixa ? <p className="text-xs text-[var(--warn)]">{item.duvida || "Confiança baixa. Confira antes de gravar."}</p> : null}
    </div>
  );
}

function preparar(item) {
  return {
    ...item,
    valor: item.valor == null ? "" : String(item.valor).replace(".", ","),
    categoria: item.categoria || "outro",
  };
}

function categoriaId(item) {
  return categoriesFor(item.direcao).some(([id]) => id === item.categoria) ? item.categoria : "outro";
}

function categoriaPronta(item) {
  if (categoriesFor(item.direcao).some(([id]) => id === item.categoria)) return { id: item.categoria, detalhe: "" };
  const nome = String(item.categoria || "").replace(/^nova:\s*/i, "").trim();
  return { id: "outro", detalhe: nome ? `Categoria sugerida: ${nome}` : "" };
}
