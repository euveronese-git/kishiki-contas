import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChartColumn, FolderClosed, Mic, Plus, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import Agenda from "./Agenda.jsx";
import Arquivos from "./Arquivos.jsx";
import CommandPalette from "./CommandPalette.jsx";
import { brand } from "./config/brand.js";
import Contas from "./Contas.jsx";
import Familia from "./Familia.jsx";
import Graficos from "./Graficos.jsx";
import IaVeronese from "./IaVeronese.jsx";
import { ADMIN_EMAIL, explainError, listAcessos, listAll, myAccess, onAuth, getSession, signOut } from "./lib/db.js";
import Login from "./Login.jsx";

const TABS = [
  ["contas", "Contas", Wallet],
  ["graficos", "Gráficos", ChartColumn],
  ["agenda", "Agenda", CalendarDays],
  ["arquivos", "Arquivos", FolderClosed],
];

export default function App() {
  const [session, setSession] = useState(undefined);
  const [acesso, setAcesso] = useState(undefined);
  const [items, setItems] = useState([]);
  const [metas, setMetas] = useState([]);
  const [metasFamilia, setMetasFamilia] = useState([]);
  const [nomes, setNomes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aba, setAba] = useState("contas");
  const [agendaRev, setAgendaRev] = useState(0);
  const [fabAberto, setFabAberto] = useState(false);
  const [pedidoAgenda, setPedidoAgenda] = useState(0);
  const [ouvindo, setOuvindo] = useState(false);

  useEffect(() => {
    let alive = true;
    getSession().then((current) => {
      if (alive) setSession(current);
    });
    const stop = onAuth((next) => {
      if (alive) setSession(next);
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    Promise.all([listAll(), myAccess()])
      .then(([data, access]) => {
        if (!alive) return;
        setItems(data.items);
        setMetas(data.metas);
        setMetasFamilia(data.metasFamilia || []);
        setAcesso(access);
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
  }, [session]);

  useEffect(() => {
    if (!acesso || acesso.papel !== "admin" || !acesso.nucleo_id || acesso.familiaPronta === false) return undefined;
    let alive = true;
    listAcessos()
      .then((rows) => {
        if (!alive) return;
        const map = {};
        for (const row of rows) if (row.user_id) map[row.user_id] = row.email;
        setNomes(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [acesso]);

  useEffect(() => {
    const onVoz = (event) => setOuvindo(Boolean(event.detail?.ouvindo));
    window.addEventListener("casa-voz", onVoz);
    return () => window.removeEventListener("casa-voz", onVoz);
  }, []);

  function abrirLancamento(voz) {
    setAba("contas");
    setFabAberto(false);
    window.dispatchEvent(new CustomEvent("casa-lancar", { detail: { voz } }));
  }

  function abrirAgenda() {
    setAba("agenda");
    setFabAberto(false);
    setPedidoAgenda((atual) => atual + 1);
  }

  if (session === undefined) {
    return (
      <main className="mx-auto grid min-h-screen max-w-3xl gap-3 px-4 py-10">
        <div className="h-11 w-40 animate-pulse rounded-[20px] bg-white/5" />
        <div className="h-24 animate-pulse rounded-[20px] bg-white/5" />
        <div className="h-40 animate-pulse rounded-[20px] bg-white/5" />
      </main>
    );
  }
  if (!session) return <Login />;

  const email = session.user?.email?.toLowerCase() || "";
  const pronta = acesso?.familiaPronta === true;
  const superAdmin = acesso?.papel === "super" || email === ADMIN_EMAIL;
  const chefe = pronta && acesso?.papel === "admin" && Boolean(acesso?.nucleo_id);
  const tabs = superAdmin || chefe ? [...TABS, ["familia", "Família", Users]] : TABS;
  const nome = session.user?.email?.split("@")[0] || "você";

  return (
    <main className="mx-auto min-h-screen max-w-[1100px] px-4 py-8 pb-28 sm:px-6 md:pb-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[12px] bg-[var(--accent)] text-lg font-semibold text-[var(--bg)]">{brand.mark}</span>
          <div>
            <p className="text-sm font-medium text-[var(--text)]">{brand.name}</p>
            <p className="text-xs text-[var(--muted)]">Olá, {nome}</p>
          </div>
        </div>
        <details className="relative">
          <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-[var(--line)] bg-white/5 text-xs font-semibold uppercase text-[var(--text)]">{nome.slice(0, 2)}</summary>
          <div className="absolute right-0 z-20 mt-2 w-44 rounded-[12px] border border-[var(--line)] bg-[var(--bg)] p-2 text-sm shadow-xl">
            <p className="truncate px-2 py-1 text-xs text-[var(--muted)]">{session.user?.email}</p>
            <button type="button" onClick={() => signOut()} className="mt-1 w-full rounded-[12px] px-2 py-2 text-left text-sm text-[var(--text)] hover:bg-white/5">Sair</button>
          </div>
        </details>
      </header>

      {chefe ? <p className="mt-6 max-w-xl text-sm text-[var(--muted)]">Você vê a sua planilha e a do cônjuge e dos filhos. Eles não veem a sua.</p> : null}

      <nav className="mt-6 hidden gap-2 md:flex" aria-label="Seções">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setAba(id)} className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm transition-colors duration-200 ${aba === id ? "text-[var(--bg)] bg-[var(--accent)] shadow-[0_0_18px_rgb(190_242_100_/_0.35)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      {error ? <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      {!loading && acesso === null ? (
        <p className="mt-8 text-sm text-zinc-400">Esse e-mail não está liberado. Peça para o administrador incluir você.</p>
      ) : null}

      <div className={aba === "contas" ? "mt-6 min-w-0" : "hidden"}>
        <Contas items={items} setItems={setItems} metas={metas} setMetas={setMetas} metasFamilia={metasFamilia} meuId={session.user.id} nomes={nomes} loading={loading} />
      </div>
      <AnimatePresence mode="wait">
        {aba === "contas" ? null : (
          <motion.div key={aba} className="mt-6 min-w-0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {aba === "graficos" ? <Graficos items={items} incluiFamilia={chefe} /> : null}
            {aba === "agenda" ? <Agenda revision={agendaRev} pedido={pedidoAgenda} meuId={session.user.id} onItem={(row) => setItems((current) => [...current, row])} /> : null}
            {aba === "arquivos" ? <Arquivos /> : null}
            {aba === "familia" && superAdmin ? <Familia modo="super" pronta={pronta} /> : null}
            {aba === "familia" && chefe ? <Familia modo="chefe" pronta={pronta} /> : null}
          </motion.div>
        )}
      </AnimatePresence>
      <footer className="mt-10 text-center text-xs text-[var(--disabled)]">{brand.credit}</footer>
      <nav className="fixed inset-x-1.5 bottom-3 z-30 grid gap-0 rounded-[20px] border border-[var(--line)] bg-[rgb(7_9_13_/_0.82)] p-1 shadow-2xl backdrop-blur-xl md:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} aria-label="Seções">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setAba(id)} className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-[12px] px-0 py-1.5 text-[12px] leading-none transition-colors duration-200 ${aba === id ? "text-[var(--glow)] shadow-[0_0_16px_rgb(190_242_100_/_0.35)]" : "text-[var(--muted)]"}`}>
            <Icon size={16} />
            <span className="whitespace-nowrap">{label}</span>
          </button>
        ))}
      </nav>
      <div className="fixed right-4 bottom-24 z-30 flex flex-col items-end gap-2 md:bottom-6">
        {fabAberto ? (
          <>
            <button type="button" onClick={() => abrirLancamento(false)} className="h-11 rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 text-sm text-[var(--text)]">+ Lançar</button>
            <button type="button" onClick={() => abrirLancamento(true)} className={`inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 text-sm text-[var(--text)] ${ouvindo ? "pulse-lima" : ""}`}><Mic size={15} /> Microfone</button>
            <button type="button" onClick={abrirAgenda} className="h-11 rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 text-sm text-[var(--text)]">Na agenda</button>
          </>
        ) : null}
        <button type="button" aria-label={fabAberto ? "Fechar ações" : "Novo lançamento"} onClick={() => setFabAberto((atual) => !atual)} className={`grid size-14 place-items-center rounded-full bg-[var(--accent)] text-[var(--bg)] shadow-[0_0_18px_rgb(190_242_100_/_0.35)] ${ouvindo ? "pulse-lima" : ""}`}>
          <Plus size={22} className={fabAberto ? "rotate-45 transition-transform" : "transition-transform"} />
        </button>
      </div>
      <CommandPalette onItem={(row) => { setItems((current) => [...current, row]); setAba("contas"); }} onAgenda={() => { setAgendaRev((current) => current + 1); setAba("agenda"); }} />
      <IaVeronese onItem={(row) => { setItems((current) => [...current, row]); setAba("contas"); }} onAgenda={(ir) => { setAgendaRev((current) => current + 1); if (ir) setAba("agenda"); }} />
    </main>
  );
}
