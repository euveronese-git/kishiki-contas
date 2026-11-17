import { Bell, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { avisosDe } from "../netlify/functions/lib/avisos.mjs";
import { listAgenda } from "./lib/db.js";
import { diaSaoPaulo } from "./lib/ia.js";
import { ativarAvisoDiario } from "./lib/push.js";

export default function Avisos({ items }) {
  const today = diaSaoPaulo();
  const [agenda, setAgenda] = useState({ atividades: [], eventos: [] });
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState("");
  const [ativando, setAtivando] = useState(false);
  const quadro = avisosDe(items, agenda, today);
  const atrasos = quadro.linhas.filter((linha) => linha.tipo === "atraso");
  const perto = quadro.linhas.filter((linha) => linha.tipo !== "atraso");
  const pill = atrasos.length || perto.length
    ? `${perto.length} por perto · ${atrasos.length} atrasado${atrasos.length === 1 ? "" : "s"}`
    : "Nada por perto";

  useEffect(() => {
    let alive = true;
    listAgenda()
      .then((data) => {
        if (alive) setAgenda(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function ligar() {
    setAtivando(true);
    setAviso("");
    try {
      setAviso(await ativarAvisoDiario());
    } catch (error) {
      setAviso(error.message || "Não consegui ativar o aviso no celular.");
    } finally {
      setAtivando(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-[var(--line)] bg-white/5">
      <button type="button" onClick={() => setAberto((atual) => !atual)} className="flex h-11 w-full items-center justify-between gap-3 rounded-full px-4 text-left" aria-expanded={aberto}>
        <span className="truncate text-sm text-[var(--text)]">{pill}</span>
        <ChevronDown size={16} className={`shrink-0 text-[var(--muted)] transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto ? (
        <div className="rounded-b-[20px] px-4 pb-4">
          {atrasos.length ? (
            <ul className="grid gap-2">
              {atrasos.map((linha) => <li key={linha.texto} className="text-sm text-[var(--warn)]">{linha.texto}</li>)}
            </ul>
          ) : null}
          {perto.length ? (
            <ul className={`grid gap-2 ${atrasos.length ? "mt-3" : ""}`}>
              {perto.map((linha) => <li key={linha.texto} className="text-sm text-[var(--muted)]">{linha.texto}</li>)}
            </ul>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={ligar} disabled={ativando} className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-xs text-[var(--text)] disabled:opacity-40">
              <Bell size={14} /> {ativando ? "Ativando..." : "Aviso diário no celular"}
            </button>
            <p className="max-w-md text-xs leading-5 text-[var(--disabled)]">Um aviso às 8h. No iPhone, só chega se a Casa Veronese estiver na tela de início. Na aba do Safari, não chega.</p>
          </div>
          {aviso ? <p className="mt-3 text-sm text-[var(--warn)]">{aviso}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
