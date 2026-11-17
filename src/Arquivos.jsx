import { FileText, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { client, explainError, getSession } from "./lib/db.js";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.txt";

export default function Arquivos() {
  const [rows, setRows] = useState([]);
  const [quota, setQuota] = useState(null);
  const [mode, setMode] = useState("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState("lista");

  useEffect(() => {
    let alive = true;
    load()
      .then((data) => {
        if (!alive) return;
        setRows(data.rows);
        setQuota(data.quota);
        setMode("ready");
      })
      .catch((err) => {
        if (!alive) return;
        const message = err?.message || "";
        if (/does not exist|schema cache|Bucket not found|not found/i.test(message)) setMode("setup");
        else {
          setMode("error");
          setError(explainError(err));
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const used = rows.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
  const limit = (quota?.quota_mb || 0) * 1024 * 1024;
  const ratio = limit ? used / limit : 0;
  const visible = rows.filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function upload(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("O arquivo passa de 10 MB.");
      return;
    }
    setError("");
    try {
      const session = await getSession();
      const supabase = client();
      const path = `${session.user.id}/${crypto.randomUUID()}-${file.name}`;
      const sent = await supabase.storage.from("arquivos").upload(path, file, { upsert: false });
      if (sent.error) throw sent.error;
      const inserted = await supabase.from("files").insert({
        path,
        name: file.name,
        size_bytes: file.size,
        mime: file.type || "application/octet-stream",
      }).select().single();
      if (inserted.error) throw inserted.error;
      setRows((current) => [inserted.data, ...current]);
    } catch (err) {
      setError(explainError(err));
    }
  }

  if (mode === "loading") return <div className="h-40 animate-pulse rounded-[20px] bg-white/5" />;
  if (mode === "setup") {
    return (
      <section className="glass p-5">
        <h2 className="text-sm font-medium text-[var(--text)]">Arquivos</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">A nuvem ainda não foi criada no Supabase. O arquivo <span className="text-[var(--text)]">supabase/arquivos.sql</span> está no projeto para você colar no SQL Editor. Enquanto isso, nenhum arquivo é inventado aqui.</p>
      </section>
    );
  }

  return (
    <section className="glass p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-[var(--text)]">Arquivos</h2>
        <div className="flex gap-2">
          {[["lista", "Lista"], ["grade", "Grade"]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setLayout(id)} className={`h-11 rounded-full px-3 text-xs ${layout === id ? "bg-[var(--accent)] text-[var(--bg)]" : "text-[var(--muted)]"}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratio >= 0.95 ? "var(--out)" : ratio >= 0.8 ? "var(--warn)" : "var(--info)" }} />
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">{mb(used)} MB de {quota?.quota_mb || 0} MB</p>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pelo nome" className="field" />
        <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--bg)]">
          <Upload size={16} /> Enviar
          <input type="file" accept={ACCEPT} className="sr-only" onChange={(event) => upload(event.target.files?.[0])} />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-[var(--out)]">{error}</p> : null}
      {visible.length === 0 ? (
        <div className="mt-8 text-center">
          <FileText className="mx-auto text-[var(--muted)]" />
          <p className="mt-2 text-sm text-[var(--muted)]">Nenhum arquivo nesta conta.</p>
        </div>
      ) : (
        <ul className={layout === "grade" ? "mt-4 grid gap-3 sm:grid-cols-2" : "mt-4 divide-y divide-white/10"}>
          {visible.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-[var(--text)]">{row.name}</p>
                <p className="text-xs text-[var(--muted)]">{mb(row.size_bytes)} MB</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function load() {
  const supabase = client();
  const files = await supabase.from("files").select("id, name, path, size_bytes, mime, created_at").order("created_at", { ascending: false });
  if (files.error) throw files.error;
  const session = await getSession();
  const quota = await supabase.from("storage_quotas").select("quota_mb").eq("user_id", session.user.id).maybeSingle();
  if (quota.error) throw quota.error;
  return { rows: files.data || [], quota: quota.data || { quota_mb: 50 } };
}

function mb(bytes) {
  return (Number(bytes || 0) / (1024 * 1024)).toFixed(1);
}
