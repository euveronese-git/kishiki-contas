import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ADMIN_EMAIL, explainError, listAcessos, revokeAccess, salvarAcesso } from "./lib/db.js";

const VINCULOS = [
  ["individual", "Individual"],
  ["admin", "Admin da família"],
  ["conjuge", "Cônjuge"],
  ["filho", "Filho"],
];

export default function Familia({ modo, pronta }) {
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState("");
  const [vinculo, setVinculo] = useState("individual");
  const [nucleoId, setNucleoId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pronta) {
      setLoading(false);
      return undefined;
    }
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
  }, [pronta]);

  const chefes = rows.filter((row) => row.papel === "admin");

  async function add(event) {
    event.preventDefault();
    setError("");
    if ((vinculo === "conjuge" || vinculo === "filho") && !nucleoId) {
      setError("Escolha o admin desta família.");
      return;
    }
    try {
      await salvarAcesso({ email, vinculo, nucleoId });
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

  if (!pronta) {
    return (
      <section className="glass mx-auto max-w-xl rounded-3xl p-4 sm:p-5">
        <h2 className="text-sm font-medium text-[var(--text)]">Família</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">A família ainda não está ligada no Supabase. Abra o SQL Editor e cole o arquivo supabase/familia.sql. Até lá, cada e-mail continua na própria planilha. O cadastro do dia a dia fica nesta aba, no celular.</p>
      </section>
    );
  }

  if (modo === "chefe") {
    return (
      <section className="glass mx-auto max-w-xl rounded-3xl p-4 sm:p-5">
        <h2 className="text-sm font-medium text-[var(--text)]">Sua família</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Você vê a sua planilha e a de quem está nesta lista. Eles continuam no app normal e não veem a sua. Quem entra é liberado pelo administrador do Veronese.</p>
        {error ? <p className="mt-3 text-sm text-[var(--out)]">{error}</p> : null}
        {loading ? <p className="mt-4 text-sm text-[var(--muted)]">Carregando…</p> : null}
        <Lista rows={rows.filter((row) => row.email !== ADMIN_EMAIL)} />
      </section>
    );
  }

  return (
    <section className="glass mx-auto max-w-xl rounded-3xl p-4 sm:p-5">
      <h2 className="text-sm font-medium text-[var(--text)]">Quem entra no Veronese</h2>
      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Só você libera e-mail. Individual fica na própria planilha. Admin da família vê o cônjuge e os filhos que você vincular a ele. Eles não convidam ninguém e não veem a planilha dele.</p>
      <form onSubmit={add} className="mt-4 grid gap-3">
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@familia.com" className={`field ${email.includes("@") ? "field-ok" : ""}`} required />
        <select value={vinculo} onChange={(event) => setVinculo(event.target.value)} className="field">
          {VINCULOS.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        {vinculo === "conjuge" || vinculo === "filho" ? (
          <select value={nucleoId} onChange={(event) => setNucleoId(event.target.value)} className="field" required>
            <option value="">Admin desta família</option>
            {chefes.map((chefe) => (
              <option key={chefe.nucleo_id} value={chefe.nucleo_id}>{chefe.email}</option>
            ))}
          </select>
        ) : null}
        <button type="submit" className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[var(--bg)]">Liberar</button>
      </form>
      {error ? <p className="mt-3 text-sm text-[var(--out)]">{error}</p> : null}
      {loading ? <p className="mt-4 text-sm text-[var(--muted)]">Carregando…</p> : null}
      <div className="mt-4 space-y-4">
        <Grupo titulo="Individuais" rows={rows.filter((row) => row.vinculo === "individual" && row.papel !== "admin" && row.papel !== "super")} onRemove={remove} />
        {chefes.map((chefe) => (
          <Grupo
            key={chefe.email}
            titulo={chefe.email}
            rows={[chefe, ...rows.filter((row) => row.nucleo_id === chefe.nucleo_id && row.email !== chefe.email)]}
            onRemove={remove}
          />
        ))}
      </div>
    </section>
  );
}

function Grupo({ titulo, rows, onRemove }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{titulo}</p>
      <Lista rows={rows} onRemove={onRemove} />
    </div>
  );
}

function Lista({ rows, onRemove }) {
  if (!rows.length) return <p className="mt-3 text-sm text-[var(--muted)]">Ninguém neste núcleo ainda.</p>;
  return (
    <ul className="mt-2 space-y-2">
      {rows.map((row) => (
        <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={row.email} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/[0.03] px-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-semibold text-[var(--bg)]">{initials(row.email)}</span>
            <div className="min-w-0">
              <p className="truncate text-sm text-[var(--text)]">{row.email}</p>
              <span className="mt-1 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] tracking-wide text-[var(--muted)]">{rotulo(row)}</span>
            </div>
          </div>
          {onRemove && row.email !== ADMIN_EMAIL ? (
            <button type="button" onClick={() => onRemove(row.email)} className="text-xs text-[var(--out)]">Tirar acesso</button>
          ) : null}
        </motion.li>
      ))}
    </ul>
  );
}

function rotulo(row) {
  if (row.papel === "super") return "Super admin";
  if (row.papel === "admin") return "Admin da família";
  if (row.vinculo === "conjuge") return "Cônjuge";
  if (row.vinculo === "filho") return "Filho";
  return "Individual";
}

function initials(email) {
  const name = String(email).split("@")[0].replace(/[^a-z0-9]/gi, "");
  return (name.slice(0, 2) || "V").toUpperCase();
}
