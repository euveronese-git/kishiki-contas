import { useEffect, useState } from "react";
import { ADMIN_EMAIL, explainError, grantAccess, listAcessos, revokeAccess } from "./lib/db.js";

export default function Familia() {
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listAcessos()
      .then((data) => {
        if (alive) setRows(data);
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

  async function add(event) {
    event.preventDefault();
    setError("");
    try {
      await grantAccess(email);
      setRows(await listAcessos());
      setEmail("");
    } catch (err) {
      setError(explainError(err));
    }
  }

  async function remove(target) {
    setError("");
    try {
      await revokeAccess(target);
      setRows(await listAcessos());
    } catch (err) {
      setError(explainError(err));
    }
  }

  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-white/10 p-4 sm:p-5">
      <h2 className="text-sm font-medium text-zinc-100">Contas da família</h2>
      <p className="mt-1 text-sm leading-6 text-zinc-400">Cada e-mail é uma conta Kishiki separada. A pessoa cria a senha dela e só vê o que ela mesma lançar. A sua planilha continua só sua. No máximo 10 contas.</p>
      <form onSubmit={add} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@familia.com" className="field" required />
        <button type="submit" disabled={rows.length >= 10} className="rounded-2xl bg-[#d6ff4a] px-4 py-3 text-sm font-medium text-zinc-950 disabled:opacity-40">Liberar</button>
      </form>
      <p className="mt-3 text-xs text-zinc-500">{rows.length} de 10</p>
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-zinc-500">Carregando…</p> : null}
      <ul className="mt-4 divide-y divide-white/10">
        {rows.map((row) => (
          <li key={row.email} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm text-zinc-100">{row.email}</p>
              <p className="text-xs text-zinc-500">{row.papel === "admin" ? "Administrador" : "Família"}</p>
            </div>
            {row.email === ADMIN_EMAIL ? null : (
              <button type="button" onClick={() => remove(row.email)} className="text-xs text-rose-300">Tirar acesso</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
