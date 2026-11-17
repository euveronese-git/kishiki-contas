import { createClient } from "@supabase/supabase-js";

const LOCAL_KEY = "kishiki-lancamentos-v1";
const META_KEY = "kishiki-metas-v1";
const TASK_KEY = "kishiki-atividades-v1";
const EVENT_KEY = "kishiki-eventos-v1";
const ACCESS_KEY = "kishiki-acessos-v1";
export const ADMIN_EMAIL = "euveronese@gmail.com";

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

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function money(value) {
  if (value == null || value === "") return null;
  return Math.round(Number(value) * 100) / 100;
}

function mapItem(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    valor: money(row.valor) ?? 0,
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
  return { id: row.id, rotulo: row.rotulo, valor: money(row.valor) ?? 0 };
}

function mapTask(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao || "",
    prazo: row.prazo || "",
    valor: row.valor == null ? "" : money(row.valor),
    feito: Boolean(row.feito),
    created_at: row.created_at,
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao || "",
    inicio: row.inicio,
    valor: row.valor == null ? "" : money(row.valor),
    feito: Boolean(row.feito),
    created_at: row.created_at,
  };
}

export function explainError(error) {
  const message = error?.message || String(error || "");
  if (/não foi liberado|Database error saving new user/i.test(message)) return "Este e-mail ainda não foi liberado.";
  if (/row-level security|permission denied|42501/i.test(message)) return "Você não tem permissão para esta ação.";
  if (/relation .* does not exist/i.test(message) || /schema cache/i.test(message)) return "A tabela ainda não existe no Supabase.";
  if (/Invalid API key|JWT/i.test(message)) return "A chave do Supabase não foi aceita.";
  if (/Invalid login credentials/i.test(message)) return "E-mail ou senha não conferem.";
  if (/Password should be/i.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/already registered|already been registered|duplicate key/i.test(message)) return "Esse e-mail já está na lista ou já tem conta.";
  if (/Failed to fetch|NetworkError|fetch/i.test(message)) return "Não consegui falar com o Supabase.";
  if (/rate limit|60 seconds/i.test(message)) return "Espere um minuto para pedir outro código.";
  return message || "Não consegui salvar.";
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

export async function signInWithPassword(email, password) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function signUp(email, password) {
  const supabase = client();
  const trimmed = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({ email: trimmed, password });
  if (error) throw error;
  if (data.session) return data.session;
  const second = await supabase.auth.signInWithPassword({ email: trimmed, password });
  if (second.error) throw second.error;
  return second.data.session;
}

export async function signOut() {
  const supabase = client();
  if (supabase) await supabase.auth.signOut();
}

export async function myAccess() {
  const supabase = client();
  const session = await getSession();
  if (!session) return null;
  if (!supabase) {
    return readJson(ACCESS_KEY, [{ email: ADMIN_EMAIL, papel: "admin" }]).find(
      (row) => row.email === session.user.email?.toLowerCase(),
    );
  }
  const { data, error } = await supabase.from("acessos").select("email, papel").eq("email", session.user.email.toLowerCase()).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listAcessos() {
  const supabase = client();
  if (!supabase) return readJson(ACCESS_KEY, [{ email: ADMIN_EMAIL, papel: "admin" }]);
  const { data, error } = await supabase.from("acessos").select("email, papel, created_at").order("created_at");
  if (error) throw error;
  return data || [];
}

export async function grantAccess(email) {
  const trimmed = email.trim().toLowerCase();
  const supabase = client();
  if (!supabase) {
    const rows = readJson(ACCESS_KEY, [{ email: ADMIN_EMAIL, papel: "admin" }]);
    if (rows.length >= 10) throw new Error("A lista já tem 10 pessoas.");
    if (!rows.some((row) => row.email === trimmed)) rows.push({ email: trimmed, papel: "membro" });
    writeJson(ACCESS_KEY, rows);
    return;
  }
  const { error } = await supabase.from("acessos").insert({ email: trimmed, papel: "membro" });
  if (error) throw error;
}

export async function revokeAccess(email) {
  const supabase = client();
  if (!supabase) {
    writeJson(
      ACCESS_KEY,
      readJson(ACCESS_KEY, []).filter((row) => row.email !== email),
    );
    return;
  }
  const { error } = await supabase.from("acessos").delete().eq("email", email);
  if (error) throw error;
}

export async function listAll() {
  const supabase = client();
  if (!supabase) return { items: readJson(LOCAL_KEY, []), metas: readJson(META_KEY, DEFAULT_METAS), mode: "local" };
  const [itemsRes, metasRes] = await Promise.all([
    supabase.from("lancamentos").select("*").order("prazo", { ascending: true }).order("ordem", { ascending: true }),
    supabase.from("metas").select("*"),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (metasRes.error) throw metasRes.error;
  const metas = (metasRes.data || []).map(mapMeta);
  return { items: (itemsRes.data || []).map(mapItem), metas: metas.length ? metas : DEFAULT_METAS, mode: "cloud" };
}

function itemPayload(input) {
  return {
    tipo: input.tipo,
    titulo: input.titulo.trim(),
    valor: money(input.valor),
    categoria: input.categoria || "outro",
    prazo: input.prazo || null,
    feito: Boolean(input.feito),
    ativo: input.ativo !== false,
    detalhe: input.detalhe?.trim() || null,
    ordem: Number(input.ordem) || 0,
  };
}

export async function createItem(input) {
  return (await createItems([input]))[0];
}

export async function createItems(rows) {
  const payload = rows.map(itemPayload);
  const supabase = client();
  if (!supabase) {
    const created = payload.map((row) => mapItem({ ...row, prazo: row.prazo || "", id: crypto.randomUUID(), created_at: new Date().toISOString() }));
    writeJson(LOCAL_KEY, [...readJson(LOCAL_KEY, []), ...created]);
    return created;
  }
  const { data, error } = await supabase.from("lancamentos").insert(payload).select();
  if (error) throw error;
  return (data || []).map(mapItem);
}

export async function updateItem(id, patch) {
  const next = { ...patch };
  if ("titulo" in next) next.titulo = next.titulo.trim();
  if ("valor" in next) next.valor = money(next.valor);
  if ("prazo" in next) next.prazo = next.prazo || null;
  if ("detalhe" in next) next.detalhe = next.detalhe?.trim() || null;
  const supabase = client();
  if (!supabase) {
    const items = readJson(LOCAL_KEY, []).map((item) => (item.id === id ? mapItem({ ...item, ...patch }) : item));
    writeJson(LOCAL_KEY, items);
    return items.find((item) => item.id === id);
  }
  const { data, error } = await supabase.from("lancamentos").update(next).eq("id", id).select().single();
  if (error) throw error;
  return mapItem(data);
}

export async function deleteItem(id) {
  const supabase = client();
  if (!supabase) {
    writeJson(LOCAL_KEY, readJson(LOCAL_KEY, []).filter((item) => item.id !== id));
    return;
  }
  const { error } = await supabase.from("lancamentos").delete().eq("id", id);
  if (error) throw error;
}

export async function updateMeta(id, valor) {
  const supabase = client();
  if (!supabase) {
    const metas = readJson(META_KEY, DEFAULT_METAS).map((meta) => (meta.id === id ? { ...meta, valor: money(valor) } : meta));
    writeJson(META_KEY, metas);
    return metas.find((meta) => meta.id === id);
  }
  const session = await getSession();
  const rotulo = DEFAULT_METAS.find((meta) => meta.id === id)?.rotulo || id;
  const { data, error } = await supabase.from("metas").upsert({ id, rotulo, valor: money(valor), user_id: session.user.id }, { onConflict: "user_id,id" }).select().single();
  if (error) throw error;
  return mapMeta(data);
}

export async function listAgenda() {
  const supabase = client();
  if (!supabase) return { atividades: readJson(TASK_KEY, []), eventos: readJson(EVENT_KEY, []) };
  const [tasks, events] = await Promise.all([
    supabase.from("atividades").select("*").order("prazo", { ascending: true }),
    supabase.from("eventos").select("*").order("inicio", { ascending: true }),
  ]);
  if (tasks.error) throw tasks.error;
  if (events.error) throw events.error;
  return { atividades: (tasks.data || []).map(mapTask), eventos: (events.data || []).map(mapEvent) };
}

export async function createTask(input) {
  const payload = {
    titulo: input.titulo.trim(),
    descricao: input.descricao?.trim() || null,
    prazo: input.prazo || null,
    valor: input.valor === "" || input.valor == null ? null : money(input.valor),
    feito: false,
  };
  const supabase = client();
  if (!supabase) {
    const row = mapTask({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    writeJson(TASK_KEY, [...readJson(TASK_KEY, []), row]);
    return row;
  }
  const { data, error } = await supabase.from("atividades").insert(payload).select().single();
  if (error) throw error;
  return mapTask(data);
}

export async function updateTask(id, patch) {
  const next = { ...patch };
  if ("titulo" in next) next.titulo = next.titulo.trim();
  if ("descricao" in next) next.descricao = next.descricao?.trim() || null;
  if ("prazo" in next) next.prazo = next.prazo || null;
  if ("valor" in next) next.valor = next.valor === "" || next.valor == null ? null : money(next.valor);
  const supabase = client();
  if (!supabase) {
    const rows = readJson(TASK_KEY, []).map((row) => (row.id === id ? mapTask({ ...row, ...patch }) : row));
    writeJson(TASK_KEY, rows);
    return rows.find((row) => row.id === id);
  }
  const { data, error } = await supabase.from("atividades").update(next).eq("id", id).select().single();
  if (error) throw error;
  return mapTask(data);
}

export async function deleteTask(id) {
  const supabase = client();
  if (!supabase) {
    writeJson(TASK_KEY, readJson(TASK_KEY, []).filter((row) => row.id !== id));
    return;
  }
  const { error } = await supabase.from("atividades").delete().eq("id", id);
  if (error) throw error;
}

export async function createEvent(input) {
  const payload = {
    titulo: input.titulo.trim(),
    descricao: input.descricao?.trim() || null,
    inicio: input.inicio,
    valor: input.valor === "" || input.valor == null ? null : money(input.valor),
    feito: false,
  };
  const supabase = client();
  if (!supabase) {
    const row = mapEvent({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    writeJson(EVENT_KEY, [...readJson(EVENT_KEY, []), row]);
    return row;
  }
  const { data, error } = await supabase.from("eventos").insert(payload).select().single();
  if (error) throw error;
  return mapEvent(data);
}

export async function updateEvent(id, patch) {
  const next = { ...patch };
  if ("titulo" in next) next.titulo = next.titulo.trim();
  if ("descricao" in next) next.descricao = next.descricao?.trim() || null;
  if ("valor" in next) next.valor = next.valor === "" || next.valor == null ? null : money(next.valor);
  const supabase = client();
  if (!supabase) {
    const rows = readJson(EVENT_KEY, []).map((row) => (row.id === id ? mapEvent({ ...row, ...patch }) : row));
    writeJson(EVENT_KEY, rows);
    return rows.find((row) => row.id === id);
  }
  const { data, error } = await supabase.from("eventos").update(next).eq("id", id).select().single();
  if (error) throw error;
  return mapEvent(data);
}

export async function deleteEvent(id) {
  const supabase = client();
  if (!supabase) {
    writeJson(EVENT_KEY, readJson(EVENT_KEY, []).filter((row) => row.id !== id));
    return;
  }
  const { error } = await supabase.from("eventos").delete().eq("id", id);
  if (error) throw error;
}
