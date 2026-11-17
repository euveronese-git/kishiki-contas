import { useState } from "react";
import { brand } from "./config/brand.js";
import { explainError, rememberDevice, sendPasswordReset, signInWithPassword } from "./lib/db.js";
import { spotlightMove } from "./ui.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      rememberDevice(remember);
      await signInWithPassword(email, password);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Digite o e-mail para receber o link.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setNotice("Se este e-mail estiver liberado, o link chega em alguns minutos. O plano grátis manda poucos e-mails por hora.");
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-md place-content-center px-4 py-10">
      <div onPointerMove={spotlightMove} className="glass spotlight p-6">
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[12px] bg-[var(--accent)] text-lg font-semibold text-[var(--bg)]">{brand.mark}</span>
          <p className="text-sm font-medium text-[var(--text)]">{brand.name}</p>
        </div>
        <h1 className="relative mt-6 text-2xl font-semibold tracking-tight text-[var(--text)]">Bem-vindo de volta</h1>
        <p className="relative mt-2 text-sm leading-6 text-[var(--muted)]">Entre com o e-mail que foi liberado. Cada pessoa vê a própria casa.</p>
        <form onSubmit={submit} className="relative mt-5 grid gap-3">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail" className="field" autoComplete="username" required />
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha"
              className="field pr-20"
              autoComplete="current-password"
              minLength={6}
              required
            />
            <button type="button" onClick={() => setShow((current) => !current)} className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-[var(--muted)]">{show ? "Ocultar" : "Mostrar"}</button>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Manter conectado neste dispositivo
          </label>
          <button type="submit" disabled={busy} className="h-11 rounded-[12px] bg-[var(--accent)] text-sm font-medium text-[var(--bg)] disabled:opacity-40">Entrar</button>
        </form>
        <button type="button" onClick={reset} className="relative mt-4 text-sm text-[var(--muted)] hover:text-[var(--text)]">Esqueci minha senha</button>
        {notice ? <p className="relative mt-4 text-sm text-[var(--muted)]">{notice}</p> : null}
        {error ? <p className="relative mt-4 text-sm text-[var(--out)]">{error}</p> : null}
      </div>
      <p className="mt-6 text-center text-xs text-[var(--disabled)]">{brand.credit}</p>
    </main>
  );
}
