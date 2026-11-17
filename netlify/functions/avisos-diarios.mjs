import webpush from "web-push";
import { avisosDe, textoDoDia } from "./lib/avisos.mjs";
import { env, reply, saoPauloDay } from "./lib/ia.mjs";

// Um aviso por pessoa, pensado para 08:00 em America/Sao_Paulo.
// O relógio não está ligado nesta leva. Chame com o cabeçalho x-avisos-secret
// quando existir um agendamento. Sem a chave, a função não envia nada.

export async function handler(event) {
  try {
    if (event.httpMethod && event.httpMethod !== "POST") return reply(405, { error: "invalid" });
    const config = env();
    const secret = process.env.AVISOS_CRON_SECRET || "";
    const got = event.headers?.["x-avisos-secret"] || event.headers?.["X-Avisos-Secret"] || "";
    const relogio = corpoAgendado(event);
    if (!(secret && got === secret) && !relogio) return reply(401, { error: "unauthorized" });
    if (relogio && got !== secret) {
      const primeiro = await marcarDia(config, saoPauloDay());
      if (!primeiro) return reply(200, { enviados: 0 });
    }
    const publica = process.env.VAPID_PUBLIC_KEY || "";
    const privada = process.env.VAPID_PRIVATE_KEY || "";
    if (!config.service || !publica || !privada) return reply(503, { error: "off" });
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:euveronese@gmail.com", publica, privada);
    const inscricoes = await linhas(config, "push_subscriptions", "select=user_id,endpoint,p256dh,auth");
    const today = saoPauloDay();
    let enviados = 0;
    for (const grupo of porPessoa(inscricoes)) {
      const texto = await textoDaPessoa(config, grupo.userId, today);
      if (!texto) continue;
      for (const inscricao of grupo.rows) {
        await webpush.sendNotification({
          endpoint: inscricao.endpoint,
          keys: { p256dh: inscricao.p256dh, auth: inscricao.auth },
        }, JSON.stringify({ title: "Casa Veronese", body: texto })).catch(() => {});
        enviados += 1;
      }
    }
    return reply(200, { enviados });
  } catch {
    return reply(500, { error: "invalid" });
  }
}

function corpoAgendado(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    return typeof body.next_run === "string";
  } catch {
    return false;
  }
}

async function marcarDia(config, day) {
  if (!config.service) return false;
  const response = await fetch(`${config.url}/rest/v1/push_runs`, {
    method: "POST",
    headers: {
      apikey: config.service,
      Authorization: `Bearer ${config.service}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=ignore-duplicates",
    },
    body: JSON.stringify({ day }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return false;
  const data = await response.json();
  return Array.isArray(data) && data.length > 0;
}

function porPessoa(rows) {
  const mapa = new Map();
  for (const row of rows) {
    const lista = mapa.get(row.user_id) || [];
    lista.push(row);
    mapa.set(row.user_id, lista);
  }
  return [...mapa.entries()].map(([userId, lista]) => ({ userId, rows: lista }));
}

async function textoDaPessoa(config, userId, today) {
  const filtro = `user_id=eq.${userId}`;
  const [lancamentos, atividades, eventos] = await Promise.all([
    linhas(config, "lancamentos", `${filtro}&select=titulo,valor,prazo,tipo,feito,ativo&ativo=eq.true&feito=eq.false`),
    linhas(config, "atividades", `${filtro}&select=titulo,prazo,feito&feito=eq.false`),
    linhas(config, "eventos", `${filtro}&select=titulo,inicio,feito&feito=eq.false`),
  ]);
  const avisos = avisosDe(lancamentos, { atividades, eventos }, today);
  if (!avisos.linhas.length) return "";
  return textoDoDia(avisos);
}

async function linhas(config, table, query) {
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: { apikey: config.service, Authorization: `Bearer ${config.service}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}
