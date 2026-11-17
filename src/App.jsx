import { useEffect, useState } from "react";
import Agenda from "./Agenda.jsx";
import Contas from "./Contas.jsx";
import Familia from "./Familia.jsx";
import Graficos from "./Graficos.jsx";
import { explainError, listAll, myAccess, onAuth, getSession, signOut } from "./lib/db.js";
import Login from "./Login.jsx";
import { FilterButton } from "./ui.jsx";

const TABS = [
  ["contas", "Contas"],
  ["graficos", "Gráficos"],
  ["agenda", "Agenda"],
];

export default function App() {
  const [session, setSession] = useState(undefined);
  const [acesso, setAcesso] = useState(undefined);
  const [items, setItems] = useState([]);
  const [metas, setMetas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aba, setAba] = useState("contas");

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

  if (session === undefined) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <p className="text-sm text-zinc-500">Abrindo…</p>
      </main>
    );
  }
  if (!session) return <Login />;

  const admin = acesso?.papel === "admin";
  const tabs = admin ? [...TABS, ["familia", "Família"]] : TABS;

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
        <div className="text-right">
          <p className="max-w-40 truncate text-xs text-zinc-500 sm:max-w-none">{session.user?.email}</p>
          <button type="button" onClick={() => signOut()} className="mt-1 text-xs text-zinc-400 hover:text-zinc-200">Sair</button>
        </div>
      </header>

      <section className="mt-8">
        <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">A casa, as contas e o que ainda falta fazer.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Esta conta é só de {session.user?.email}. Cada familiar entra com o próprio e-mail e vê a própria planilha.</p>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <FilterButton key={id} active={aba === id} onClick={() => setAba(id)}>{label}</FilterButton>
        ))}
      </div>

      {error ? <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      {!loading && acesso === null ? (
        <p className="mt-8 text-sm text-zinc-400">Esse e-mail não está liberado. Peça para o administrador incluir você.</p>
      ) : null}

      <div className="mt-6">
        {aba === "contas" ? <Contas items={items} setItems={setItems} metas={metas} setMetas={setMetas} loading={loading} /> : null}
        {aba === "graficos" ? <Graficos items={items} /> : null}
        {aba === "agenda" ? <Agenda /> : null}
        {aba === "familia" && admin ? <Familia /> : null}
      </div>
    </main>
  );
}
