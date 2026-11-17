import { useState } from "react";
import { explainError, signInWithPassword, signUp } from "./lib/db.js";

export default function Login() {
  const [mode, setMode] = useState("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "criar") await signUp(email, password);
      else await signInWithPassword(email, password);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-md place-content-center px-4">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#d6ff4a] text-lg font-semibold text-zinc-950">K</span>
          <div>
            <p className="text-sm font-medium tracking-wide text-zinc-100">Kishiki</p>
            <p className="text-[11px] tracking-[0.22em] text-zinc-500">IT SOLUTIONS</p>
          </div>
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-50">{mode === "criar" ? "Criar conta" : "Entrar na planilha"}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          {mode === "criar" ? "Crie a sua conta com o e-mail que foi liberado. Ela fica separada das outras." : "Entre na sua conta. Cada e-mail tem a própria planilha."}
        </p>
        <form onSubmit={submit} className="mt-5 grid gap-3">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail" className="field" autoComplete="email" required />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Senha"
            className="field"
            autoComplete={mode === "criar" ? "new-password" : "current-password"}
            minLength={6}
            required
          />
          <button type="submit" disabled={busy} className="rounded-2xl bg-[#d6ff4a] px-4 py-3 text-sm font-medium text-zinc-950 disabled:opacity-40">
            {mode === "criar" ? "Criar conta" : "Entrar"}
          </button>
        </form>
        <button type="button" onClick={() => { setMode(mode === "criar" ? "entrar" : "criar"); setError(""); }} className="mt-4 text-xs text-zinc-400 hover:text-zinc-200">
          {mode === "criar" ? "Já tenho conta" : "Fui liberado e quero criar a conta"}
        </button>
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </div>
    </main>
  );
}
