import { Check, ChevronDown, Inbox, Mic, Pencil, Plus, Scissors, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Arvore, chavesDeHoje, montarArvore } from "./Arvore.jsx";
import Avisos from "./Avisos.jsx";
import { ResumoMes } from "./IaVeronese.jsx";
import { categoriesFor, categoryLabel, categoryOptions, defaultCategory } from "./lib/categories.js";
import { createItem, createItems, deleteItem, explainError, listAll, updateItem, updateMeta } from "./lib/db.js";
import { abrirIa, chamarIa, mensagemIa } from "./lib/ia.js";
import { guessMapping, headersOf, parseCategoria, parseDateCell, parseTipo, readTable } from "./lib/excel.js";
import { addMonths, CountUp, daysFromToday, FilterButton, moneyText, parseMoney, todayISO } from "./ui.jsx";

const emptyDraft = { tipo: "pagar", titulo: "", valor: "", categoria: "dividas", prazo: "", detalhe: "" };

export default function Contas({ items, setItems, metas, setMetas, metasFamilia = [], meuId = "", nomes = {}, loading }) {
  const [error, setError] = useState("");
  const [situacao, setSituacao] = useState("abertos");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(emptyDraft);
  const [confirmId, setConfirmId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [parcelId, setParcelId] = useState(null);
  const [vezes, setVezes] = useState("12");
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [ouvi, setOuvi] = useState("");
  const [gaveta, setGaveta] = useState(false);
  const [abertos, setAbertos] = useState(() => new Set(chavesDeHoje()));
  const fala = useRef(null);
  const falarRef = useRef(() => {});

  const totals = useMemo(() => summarize(items), [items]);
  const sitePrice = metas.find((meta) => meta.id === "site")?.valor ?? 1000;
  const packagePrice = metas.find((meta) => meta.id === "pacote")?.valor ?? 2500;
  const visible = useMemo(() => items.filter((item) => {
    if (tipoFiltro !== "todos" && item.tipo !== tipoFiltro) return false;
    if (situacao === "abertos") return !item.feito;
    if (situacao === "feitos") return item.feito;
    return true;
  }), [items, situacao, tipoFiltro]);
  const arvore = useMemo(() => montarArvore(
    [...visible]
      .sort((a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999") || a.ordem - b.ordem)
      .map((item) => ({ iso: item.prazo || "", item })),
  ), [visible]);

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
    if (!draft.titulo.trim() || valor == null || valor < 0) return;
    const ordem = items.filter((item) => item.prazo === draft.prazo).reduce((max, item) => Math.max(max, item.ordem), 0) + 1;
    run(async () => {
      const created = await createItem({ ...draft, valor, ordem });
      setItems((current) => [...current, created]);
      setDraft((current) => ({ ...current, titulo: "", valor: "", detalhe: "" }));
      setOuvi("");
      setGaveta(false);
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
    if (!edit.titulo.trim() || valor == null || valor < 0) {
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
    run(async () => replaceItem(await updateItem(item.id, { feito: !previous })));
  }

  function toggleAtivo(item) {
    run(async () => replaceItem(await updateItem(item.id, { ativo: !item.ativo })));
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
    const cents = Math.round(item.valor * 100);
    const base = Math.floor(cents / parts);
    const values = Array.from({ length: parts }, (_, index) => (index === parts - 1 ? cents - base * (parts - 1) : base) / 100);
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

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const rows = await readTable(file);
      if (rows.length === 0) {
        setError("A planilha está vazia.");
        return;
      }
      const guess = guessMapping(rows);
      setSheet({ rows, header: guess.header, columns: { titulo: 0, valor: 1, prazo: "", tipo: "", categoria: "", ...guess.columns } });
      setGaveta(false);
      setError("");
    } catch {
      setError("Não consegui ler esse arquivo.");
    }
  }

  function confirmSheet() {
    const start = sheet.header ? 1 : 0;
    const parsed = sheet.rows.slice(start).flatMap((row) => {
      const titulo = String(row[sheet.columns.titulo] ?? "").trim();
      let valor = parseMoney(row[sheet.columns.valor]);
      if (!titulo || valor == null) return [];
      let tipo = sheet.columns.tipo === "" ? "pagar" : parseTipo(row[sheet.columns.tipo]);
      if (valor < 0) {
        tipo = "pagar";
        valor = Math.abs(valor);
      }
      const categoria = sheet.columns.categoria === "" ? defaultCategory(tipo) : parseCategoria(tipo, row[sheet.columns.categoria]);
      const prazo = sheet.columns.prazo === "" ? "" : parseDateCell(row[sheet.columns.prazo]);
      return [{ tipo, titulo, valor, categoria, prazo, detalhe: "Importado da planilha", ativo: true, feito: false, ordem: 0 }];
    });
    if (parsed.length === 0) {
      setError("Nenhuma linha tinha nome e valor.");
      return;
    }
    run(async () => {
      const created = await createItems(parsed);
      setItems((current) => [...current, ...created]);
      setSheet(null);
    });
  }

  function falar() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Este navegador não transcreve voz. Digite a frase ou use a IA Veronese.");
      return;
    }
    const rec = new Ctor();
    fala.current = rec;
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.onresult = (event) => {
      const texto = event.results?.[0]?.[0]?.transcript || "";
      setOuvi(texto);
      if (texto.trim()) preencherPorVoz(texto);
    };
    rec.onerror = () => setError("Não consegui ouvir. Tente de novo ou digite.");
    rec.onend = () => setOuvindo(false);
    setError("");
    setOuvindo(true);
    rec.start();
  }

  falarRef.current = falar;

  useEffect(() => {
    const onLancar = (event) => {
      setGaveta(true);
      if (event.detail?.voz) falarRef.current();
    };
    window.addEventListener("casa-lancar", onLancar);
    return () => window.removeEventListener("casa-lancar", onLancar);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("casa-voz", { detail: { ouvindo } }));
  }, [ouvindo]);

  async function preencherPorVoz(texto) {
    setSaving(true);
    try {
      const data = await chamarIa("ai-parse", { texto });
      const contas = (data.itens || []).filter((item) => item.tipo === "conta" && item.titulo);
      const item = contas[0];
      if (!item) {
        setError("A frase não virou um lançamento. Tente de novo.");
        return;
      }
      const tipo = item.direcao === "receber" ? "receber" : "pagar";
      const conhecida = categoriesFor(tipo).some(([id]) => id === item.categoria);
      const outros = contas.slice(1).map((linha) => linha.titulo).filter(Boolean);
      const partes = [];
      if (!conhecida && item.categoria) partes.push(`Categoria sugerida: ${String(item.categoria).replace(/^nova:\s*/i, "")}`);
      if (outros.length) partes.push(`Também ouvi: ${outros.join(", ")}.`);
      if (item.duvida) partes.push(item.duvida);
      setDraft({
        tipo,
        titulo: item.titulo,
        valor: item.valor == null ? "" : String(item.valor).replace(".", ","),
        categoria: conhecida ? item.categoria : "outro",
        prazo: item.data || "",
        detalhe: partes.join(" "),
      });
    } catch (err) {
      setError(mensagemIa(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Avisos items={items} />
      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <p className="text-xs text-[var(--muted)]">Falta vender</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-[var(--text)] sm:text-5xl"><CountUp value={totals.falta} /></p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted)]">A pagar</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-[var(--text)] sm:text-5xl"><CountUp value={totals.openPay} /></p>
        </div>
      </section>

      <Sanfona titulo="Resumo da IA">
        <ResumoMes />
      </Sanfona>
      <Sanfona titulo="Metas de vendas">
        <p className="text-sm leading-6 text-[var(--muted)]">Já pago <span className="tabular text-[var(--text)]">{moneyText(totals.paid)}</span>. Previsto fora dos sites <span className="tabular text-[var(--text)]">{moneyText(totals.pendingOther)}</span>.</p>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Sites em aberto: <span className="tabular text-[var(--text)]">{moneyText(totals.pendingSites)}</span>. Se entrarem, ainda faltam <span className="tabular text-[var(--accent)]">{moneyText(totals.seMetasEntrarem)}</span>.
        </p>
        <div className="mt-4 grid gap-4">
          <MilestoneTrack count={units(totals.seMetasEntrarem, sitePrice)} price={sitePrice} noun="sites" />
          <MilestoneTrack count={units(totals.seMetasEntrarem, packagePrice)} price={packagePrice} noun="pacotes" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <PriceField key={`site-${sitePrice}`} label="Site" defaultValue={sitePrice} onCommit={(value) => saveMeta("site", value)} />
          <PriceField key={`pacote-${packagePrice}`} label="Pacote" defaultValue={packagePrice} onCommit={(value) => saveMeta("pacote", value)} />
        </div>
        {metasFamilia.length ? (
          <ul className="mt-4 space-y-1 text-xs text-[var(--muted)]">
            {metasFamilia.map((meta) => (
              <li key={`${meta.user_id}-${meta.id}`}>{nomes[meta.user_id] || "Família"} · {meta.rotulo}: {moneyText(meta.valor)}</li>
            ))}
          </ul>
        ) : null}
      </Sanfona>

      {gaveta ? (
        <div className="fixed inset-0 z-40 grid items-end bg-black/55 p-3 md:place-items-center" onClick={() => setGaveta(false)}>
          <form onClick={(event) => event.stopPropagation()} onSubmit={submitNew} className="glass max-h-[88vh] w-full max-w-lg overflow-y-auto p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-[var(--text)]">Novo lançamento</p>
              <button type="button" aria-label="Fechar" onClick={() => setGaveta(false)} className="grid size-11 place-items-center text-[var(--muted)]"><X size={16} /></button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={falar} className={`inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm text-[var(--text)] ${ouvindo ? "pulse-lima" : ""}`}>
                <Mic size={15} /> {ouvindo ? "Ouvindo..." : "Falar"}
              </button>
              <button type="button" onClick={() => abrirIa("lancar")} className="inline-flex h-11 items-center rounded-full border border-[var(--line)] px-4 text-sm text-[var(--text)]">IA Veronese</button>
              <TipoSwitch value={draft.tipo} onChange={(tipo) => setDraft((current) => ({ ...current, tipo, categoria: keepCategory(tipo, current.categoria) }))} />
            </div>
            <div className="mt-4 grid gap-3">
              <input value={draft.titulo} onChange={(event) => setDraft((current) => ({ ...current, titulo: event.target.value }))} placeholder="Nome" className="field text-base" />
              <input value={draft.valor} onChange={(event) => setDraft((current) => ({ ...current, valor: event.target.value }))} inputMode="decimal" placeholder="0,00" className="field text-base tabular" />
              <CategorySelect tipo={draft.tipo} value={draft.categoria} onChange={(categoria) => setDraft((current) => ({ ...current, categoria }))} />
              <input type="date" value={draft.prazo} onChange={(event) => setDraft((current) => ({ ...current, prazo: event.target.value }))} className="field text-base" />
              <input value={draft.detalhe} onChange={(event) => setDraft((current) => ({ ...current, detalhe: event.target.value }))} placeholder="Detalhe, opcional" className="field text-base" />
            </div>
            {ouvi ? <p className="mt-3 text-xs text-[var(--muted)]">Ouvi: {ouvi}. Revise e clique em Anotar.</p> : null}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button type="submit" disabled={saving || !draft.titulo.trim() || parseMoney(draft.valor) == null || parseMoney(draft.valor) < 0} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-sm font-medium text-[var(--bg)] disabled:opacity-40">
                <Plus size={16} /> Anotar
              </button>
              <label className="inline-flex h-12 cursor-pointer items-center justify-center rounded-2xl border border-[var(--line)] px-4 text-sm text-[var(--text)]">
                Importar Excel
                <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="sr-only" />
              </label>
            </div>
          </form>
        </div>
      ) : null}

      {sheet ? (
        <SheetPreview sheet={sheet} setSheet={setSheet} onCancel={() => setSheet(null)} onConfirm={confirmSheet} saving={saving} />
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => abrirIa("lancar")} className="h-9 rounded-full px-3 text-xs text-[var(--muted)]">IA Veronese</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          ["abertos", "Em aberto"],
          ["feitos", "Concluídos"],
          ["todos", "Todos"],
        ].map(([value, label]) => (
          <FilterButton key={value} active={situacao === value} onClick={() => setSituacao(value)}>{label}</FilterButton>
        ))}
        <span className="mx-1 hidden w-px bg-white/10 sm:block" />
        {[
          ["todos", "Tudo"],
          ["pagar", "A pagar"],
          ["receber", "A receber"],
        ].map(([value, label]) => (
          <FilterButton key={value} active={tipoFiltro === value} onClick={() => setTipoFiltro(value)}>{label}</FilterButton>
        ))}
      </div>

      {error ? <p className="mt-4 rounded-[12px] border border-[var(--out)]/30 bg-[var(--out)]/10 px-4 py-3 text-sm text-[var(--out)]">{error}</p> : null}
      {loading ? (
        <div className="mt-6 space-y-3">
          <div className="h-24 animate-pulse rounded-[20px] bg-white/5" />
          <div className="h-24 animate-pulse rounded-[20px] bg-white/5" />
        </div>
      ) : null}
      {!loading && arvore.years.length === 0 && arvore.loose.length === 0 ? (
        <div className="mt-8 rounded-[20px] border border-dashed border-white/15 px-5 py-10 text-center">
          <Inbox className="mx-auto text-[var(--muted)]" size={28} />
          <p className="mt-3 text-sm text-[var(--muted)]">Nada neste filtro. Anote uma conta ou mude o recorte.</p>
        </div>
      ) : null}

      <Arvore
        arvore={arvore}
        abertos={abertos}
        alternar={(id) => setAbertos((atual) => {
          const next = new Set(atual);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })}
        resumo={resumoConta}
        badgeDia={badgeConta}
        renderDia={(rows) => (
              <ul>
                {rows.map((item) => {
                  const alheio = Boolean(meuId && item.user_id && item.user_id !== meuId);
                  const dono = alheio ? nomes[item.user_id] || "Família" : "";
                  return (
                  <li key={item.id} className={`group border-t border-white/5 px-4 py-3 first:border-t-0 sm:px-5 ${item.ativo ? "" : "opacity-55"}`}>
                    {editingId === item.id && !alheio ? (
                      <EditForm edit={edit} setEdit={setEdit} onCancel={() => setEditingId(null)} onSave={() => saveEdit(item)} saving={saving} />
                    ) : (
                      <div className="flex items-start gap-3">
                        {alheio ? (
                          <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border ${item.feito ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]" : "border-white/20 text-transparent"}`}><Check size={15} /></span>
                        ) : (
                          <button type="button" aria-label={item.feito ? "Desmarcar" : item.tipo === "pagar" ? "Marcar como pago" : "Marcar como recebido"} onClick={() => toggleFeito(item)} className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border ${item.feito ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]" : "border-white/20 text-transparent"}`}>
                            <Check size={15} />
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <button type="button" onClick={() => { if (!alheio) setMenuId(menuId === item.id ? null : item.id); }} className="w-full text-left">
                            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <span className={`text-sm font-medium ${item.feito ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{item.titulo}</span>
                              <span className="text-xs uppercase tracking-wide text-zinc-500">{item.tipo === "pagar" ? "Pagar" : "Receber"} · {categoryLabel(item.categoria)}</span>
                              {!item.ativo ? <span className="text-xs text-[var(--warn)]">Fora da conta</span> : null}
                              {dono ? <span className="text-xs text-[var(--info)]">{dono}</span> : null}
                            </span>
                            {item.detalhe ? <span className="mt-1 block text-xs leading-5 text-zinc-500">{item.detalhe}</span> : null}
                          </button>
                          {alheio || menuId !== item.id ? null : (
                          <ItemActions
                            item={item}
                            confirm={confirmId === item.id}
                            onEdit={() => startEdit(item)}
                            onAtivo={() => toggleAtivo(item)}
                            onParcel={() => { setParcelId(parcelId === item.id ? null : item.id); setVezes("12"); setConfirmId(null); }}
                            onRemove={() => remove(item)}
                          />
                          )}
                          {alheio || parcelId !== item.id ? null : (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <input value={vezes} onChange={(event) => setVezes(event.target.value)} inputMode="numeric" className="field w-24" />
                              <span className="text-xs text-zinc-500">vezes a partir desta data</span>
                              <button type="button" onClick={() => parcelar(item)} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[var(--bg)]">Gerar parcelas</button>
                            </div>
                          )}
                        </div>
                        <p className={`tabular shrink-0 text-sm font-medium ${item.tipo === "receber" ? "text-[var(--in)]" : "text-[var(--out)]"}`}>
                          {item.tipo === "receber" ? "+" : "−"} {moneyText(item.valor)}
                        </p>
                      </div>
                    )}
                  </li>
                  );
                })}
              </ul>
        )}
      />
    </div>
  );
}

function resumoConta(rows) {
  let pagar = 0;
  let receber = 0;
  for (const item of rows) {
    if (item.ativo === false) continue;
    if (item.tipo === "receber") receber += Number(item.valor) || 0;
    else pagar += Number(item.valor) || 0;
  }
  return (
    <span className="flex items-baseline gap-2">
      {pagar > 0 ? <span className="tabular text-sm text-[var(--out)]">{moneyText(pagar)}</span> : null}
      {receber > 0 ? <span className="tabular text-sm text-[var(--accent)]">+ {moneyText(receber)}</span> : null}
      {pagar <= 0 && receber <= 0 ? <span className="tabular text-sm text-zinc-400">{moneyText(0)}</span> : null}
    </span>
  );
}

function badgeConta(iso, rows) {
  const pagar = rows.some((item) => item.ativo !== false && item.tipo === "pagar" && !item.feito);
  if (iso < todayISO() && pagar) return <span className="shrink-0 rounded-full bg-[var(--warn)]/15 px-2 py-1 text-xs text-[var(--warn)]">Atrasado</span>;
  if (daysFromToday(iso) === 0) return <span className="shrink-0 rounded-full bg-[var(--accent)] px-2 py-1 text-xs text-[var(--bg)]">Hoje</span>;
  return null;
}

function ItemActions({ item, confirm, onEdit, onAtivo, onParcel, onRemove }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <IconAction label="Editar" onClick={onEdit}><Pencil size={15} /></IconAction>
      <IconAction label={item.ativo ? "Tirar da conta" : "Incluir na conta"} onClick={onAtivo}><X size={15} /></IconAction>
      {item.tipo === "pagar" && item.prazo && !item.feito ? <IconAction label="Parcelar" onClick={onParcel}><Scissors size={15} /></IconAction> : null}
      <IconAction label={confirm ? "Confirmar exclusão" : "Apagar"} danger={confirm} onClick={onRemove}><Trash2 size={15} /></IconAction>
    </div>
  );
}

function Sanfona({ titulo, children }) {
  const [aberta, setAberta] = useState(false);
  return (
    <section className="mt-4 rounded-[20px] border border-[var(--line)]">
      <button type="button" onClick={() => setAberta((atual) => !atual)} className="flex h-12 w-full items-center justify-between px-4 text-left" aria-expanded={aberta}>
        <span className="text-sm text-[var(--text)]">{titulo}</span>
        <ChevronDown size={16} className={`text-[var(--muted)] transition-transform ${aberta ? "rotate-180" : ""}`} />
      </button>
      {aberta ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

function IconAction({ label, onClick, children, danger = false }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid size-11 place-items-center rounded-[12px] ${danger ? "text-[var(--out)]" : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"}`}>
      {children}
    </button>
  );
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
  return { openPay, paid, pendingOther, pendingSites, falta, seMetasEntrarem };
}

function units(amount, price) {
  if (amount <= 0.004 || price <= 0) return 0;
  return Math.ceil(amount / price - 1e-9);
}

function MilestoneTrack({ count, price, noun }) {
  const one = noun === "sites" ? "site" : "pacote";
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">{count === 1 ? `1 ${one}` : `${count} ${noun}`}</p>
        <p className="tabular text-xs text-[var(--accent)]">{moneyText(count * price)}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="meta-fill h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--glow)] shadow-[4px_0_10px_var(--glow)]" style={{ width: count > 0 ? "100%" : "0%" }} />
      </div>
    </div>
  );
}

function keepCategory(tipo, current) {
  return categoriesFor(tipo).some(([value]) => value === current) ? current : defaultCategory(tipo);
}

function TipoSwitch({ value, onChange }) {
  return (
    <div className="flex rounded-full bg-white/5 p-1">
      {[["pagar", "A pagar"], ["receber", "A receber"]].map(([id, label]) => (
        <button key={id} type="button" onClick={() => onChange(id)} className={`rounded-full px-3 py-1.5 text-xs ${value === id ? "bg-[var(--accent)] text-[var(--bg)]" : "text-zinc-400"}`}>{label}</button>
      ))}
    </div>
  );
}

function CategorySelect({ tipo, value, onChange }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="field">
      {categoryOptions(tipo, value).map(([id, label]) => (
        <option key={id} value={id}>{label}</option>
      ))}
    </select>
  );
}

function SheetPreview({ sheet, setSheet, onCancel, onConfirm, saving }) {
  const names = headersOf(sheet.rows, sheet.header);
  const sample = sheet.rows.slice(sheet.header ? 1 : 0, sheet.header ? 6 : 5);
  function setColumn(field, value) {
    setSheet((current) => ({ ...current, columns: { ...current.columns, [field]: value === "" ? "" : Number(value) } }));
  }
  return (
    <section className="mt-4 rounded-3xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-100">Conferir a planilha antes de gravar</p>
        <button type="button" onClick={onCancel} className="text-xs text-zinc-400">Cancelar</button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["titulo", "Nome"],
          ["valor", "Valor"],
          ["prazo", "Data"],
          ["tipo", "Tipo"],
          ["categoria", "Categoria"],
        ].map(([field, label]) => (
          <label key={field} className="grid gap-1 text-xs text-zinc-400">
            {label}
            <select value={sheet.columns[field] === "" || sheet.columns[field] == null ? "" : sheet.columns[field]} onChange={(event) => setColumn(field, event.target.value)} className="field">
              {field !== "titulo" && field !== "valor" ? <option value="">Ignorar</option> : null}
              {names.map((name, index) => (
                <option key={name + index} value={index}>{name}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <ul className="mt-4 space-y-1 text-xs text-zinc-400">
        {sample.map((row, index) => (
          <li key={index}>{row.filter(Boolean).slice(0, 4).join(" · ") || "Linha vazia"}</li>
        ))}
      </ul>
      <button type="button" disabled={saving} onClick={onConfirm} className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--bg)] disabled:opacity-40">
        Gravar linhas válidas
      </button>
    </section>
  );
}

function PriceField({ label, defaultValue, onCommit }) {
  const [value, setValue] = useState(String(defaultValue).replace(".", ","));
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-xs text-zinc-400">
      {label}
      <input value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => onCommit(value)} inputMode="decimal" className="w-24 bg-transparent text-sm text-zinc-100 outline-none" />
    </label>
  );
}

function TextButton({ children, onClick, danger = false }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 text-xs ${danger ? "text-rose-300" : "text-zinc-400 hover:text-zinc-200"}`}>{children}</button>
  );
}

function EditForm({ edit, setEdit, onCancel, onSave, saving }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <select value={edit.tipo} onChange={(event) => setEdit((current) => ({ ...current, tipo: event.target.value, categoria: keepCategory(event.target.value, current.categoria) }))} className="field">
          <option value="pagar">A pagar</option>
          <option value="receber">A receber</option>
        </select>
        <input value={edit.titulo} onChange={(event) => setEdit((current) => ({ ...current, titulo: event.target.value }))} className="field lg:col-span-2" />
        <input value={edit.valor} onChange={(event) => setEdit((current) => ({ ...current, valor: event.target.value }))} inputMode="decimal" className="field" />
        <CategorySelect tipo={edit.tipo} value={edit.categoria} onChange={(categoria) => setEdit((current) => ({ ...current, categoria }))} />
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
        <button type="button" onClick={onSave} disabled={saving} className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-medium text-[var(--bg)]">Salvar</button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs text-zinc-400"><X size={13} /> Cancelar</button>
      </div>
    </div>
  );
}
