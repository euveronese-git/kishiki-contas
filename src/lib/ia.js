import { client, getSession } from "./db.js";

export function abrirIa(modo = "lancar") {
  window.dispatchEvent(new CustomEvent("casa-ia", { detail: { modo } }));
}

export function diaSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function mesAtual() {
  return diaSaoPaulo().slice(0, 7);
}

export function mensagemIa(error) {
  const code = error?.code || "";
  if (code === "off") return "A IA ainda não está ligada. O lançamento manual continua funcionando.";
  if (code === "resting") return "A IA está descansando, tente mais tarde.";
  if (code === "limit") return "O limite de hoje acabou. Amanhã a IA volta.";
  if (code === "unauthorized") return "Entre de novo para usar a IA.";
  return "A IA não entendeu. Tente uma frase mais clara.";
}

export async function chamarIa(nome, body) {
  const session = await getSession();
  if (!session?.access_token) {
    const error = new Error("unauthorized");
    error.code = "unauthorized";
    throw error;
  }
  let response;
  try {
    response = await fetch(`/.netlify/functions/${nome}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    const error = new Error("off");
    error.code = "off";
    throw error;
  }
  const type = response.headers.get("content-type") || "";
  if (!type.includes("json")) {
    const error = new Error("off");
    error.code = "off";
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "invalid");
    error.code = response.status === 404 ? "off" : data.error || "invalid";
    throw error;
  }
  return data;
}

export async function usosDeHoje() {
  const supabase = client();
  if (!supabase) return null;
  const { data, error } = await supabase.from("ai_usage").select("count").eq("day", diaSaoPaulo()).maybeSingle();
  if (error) return null;
  return data?.count || 0;
}

export async function lerResumo() {
  const supabase = client();
  if (!supabase) return { texto: "", criadoEm: null, ausente: true };
  const { data, error } = await supabase.from("ai_summaries").select("text, created_at").eq("month", mesAtual()).maybeSingle();
  if (error) return { texto: "", criadoEm: null, ausente: true };
  return { texto: data?.text || "", criadoEm: data?.created_at || null, ausente: false };
}
