import { createClient } from "@supabase/supabase-js";

const LOCAL_KEY = "kishiki-lancamentos-v1";
const META_KEY = "kishiki-metas-v1";
export const ALLOWED_EMAIL = "euveronese@gmail.com";

const DEFAULT_METAS = [
  { id: "site", rotulo: "Site", valor: 1000 },
  { id: "pacote", rotulo: "Pacote", valor: 2500 },
];

let cached = null;

export function client() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
    });
  }
  return cached;
}

export function isCloud() {
  return Boolean(client());
}

function redirectTo() {
  if (typeof window === "undefined") return "https://kishiki-contas.netlify.app";
  return window.location.origin;
}

export async function getSession() {
  const supabase = client();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuth(callback) {
  const supabase = client();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function sendAccess(email) {
  const supabase = client();
  const trimmed = email.trim().toLowerCase();
  if (trimmed !== ALLOWED_EMAIL) throw new Error("Este e-mail não tem acesso a esta planilha.");
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectTo(),
    },
  });
  if (error) throw error;
}

export async function verifyAccess(email, token) {
  const supabase = client();
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const supabase = client();
  if (supabase) await supabase.auth.signOut();
}

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readLocal() {
  const parsed = readJson(LOCAL_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeLocal(items) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

function readMetas() {
  const parsed = readJson(META_KEY, null);
  if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_METAS.map((meta) => ({ ...meta }));
  return parsed;
}

function writeMetas(metas) {
  localStorage.setItem(META_KEY, JSON.stringify(metas));
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function mapItem(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    valor: money(row.valor),
    categoria: row.categoria || "outro",
    prazo: row.prazo || "",
    feito: Boolean(row.feito),
    ativo: row.ativo !== false,
    detalhe: row.detalhe || "",
    ordem: Number(row.ordem) || 0,
    created_at: row.created_at,
  };
}

function mapMeta(row) {
  return { id: row.id, rotulo: row.rotulo, valor: money(row.valor) };
}

export function explainError(error) {
  const message = error?.message || String(error || "");
  if (/relation .* does not exist/i.test(message) || /schema cache/i.test(message)) {
    return "A tabela ainda não existe no Supabase.";
  }
  if (/Invalid API key|JWT/i.test(message)) return "A chave do Supabase não foi aceita.";
  if (/Failed to fetch|NetworkError|fetch/i.test(message)) return "Não consegui falar com o Supabase.";
  if (/rate limit|60 seconds/i.test(message)) return "Espere um minuto para pedir outro código.";
  if (/invalid|expired|otp/i.test(message) && /token|otp|code/i.test(message)) return "Esse código não valeu. Peça outro.";
  return message || "Não consegui salvar no Supabase.";
}

export async function listAll() {
  const supabase = client();
  if (!supabase) return { items: readLocal(), metas: readMetas(), mode: "local" };
  const session = await getSession();
  if (!session) return { items: [], metas: DEFAULT_METAS, mode: "cloud" };

  const [itemsRes, metasRes] = await Promise.all([
    supabase.from("lancamentos").select("*").order("prazo", { ascending: true }).order("ordem", { ascending: true }),
    supabase.from("metas").select("*"),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (metasRes.error) throw metasRes.error;

  const metas = (metasRes.data || []).map(mapMeta);
  return {
    items: (itemsRes.data || []).map(mapItem),
    metas: metas.length ? metas : DEFAULT_METAS,
    mode: "cloud",
  };
}

export async function createItem(input) {
  const payload = {
    tipo: input.tipo,
    titulo: input.titulo.trim(),
    valor: money(input.valor),
    categoria: input.categoria || "outro",
    prazo: input.prazo || null,
    feito: false,
    ativo: input.ativo !== false,
    detalhe: input.detalhe?.trim() || null,
    ordem: Number(input.ordem) || 0,
  };
  const supabase = client();
  if (!supabase) {
    const item = mapItem({ ...payload, prazo: input.prazo || "", id: crypto.randomUUID(), created_at: new Date().toISOString() });
    writeLocal([item, ...readLocal()]);
    return item;
  }
  const { data, error } = await supabase.from("lancamentos").insert(payload).select().single();
  if (error) throw error;
  return mapItem(data);
}

export async function updateItem(id, patch) {
  const next = { ...patch };
  if ("titulo" in next) next.titulo = next.titulo.trim();
  if ("valor" in next) next.valor = money(next.valor);
  if ("prazo" in next) next.prazo = next.prazo || null;
  if ("detalhe" in next) next.detalhe = next.detalhe?.trim() || null;

  const supabase = client();
  if (!supabase) {
    const items = readLocal().map((item) => (item.id === id ? mapItem({ ...item, ...patch, prazo: patch.prazo ?? item.prazo }) : item));
    writeLocal(items);
    return items.find((item) => item.id === id);
  }
  const { data, error } = await supabase.from("lancamentos").update(next).eq("id", id).select().single();
  if (error) throw error;
  return mapItem(data);
}

export async function deleteItem(id) {
  const supabase = client();
  if (!supabase) {
    writeLocal(readLocal().filter((item) => item.id !== id));
    return;
  }
  const { error } = await supabase.from("lancamentos").delete().eq("id", id);
  if (error) throw error;
}

export async function updateMeta(id, valor) {
  const supabase = client();
  if (!supabase) {
    const metas = readMetas().map((meta) => (meta.id === id ? { ...meta, valor: money(valor) } : meta));
    writeMetas(metas);
    return metas.find((meta) => meta.id === id);
  }
  const { data, error } = await supabase.from("metas").update({ valor: money(valor) }).eq("id", id).select().single();
  if (error) throw error;
  return mapMeta(data);
}
