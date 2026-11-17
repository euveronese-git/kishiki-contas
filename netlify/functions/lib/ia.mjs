const CATEGORIAS = {
  pagar: ["contas", "assinaturas", "dividas", "casa", "compras", "saude", "viagem", "autoescola", "obrigacoes", "outro"],
  receber: ["salario", "bolsa", "investimentos", "fechamento", "olx", "site", "familia", "outro"],
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function saoPauloDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function env() {
  return {
    geminiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    userLimit: Number(process.env.AI_DAILY_LIMIT || 20),
    globalLimit: Number(process.env.AI_GLOBAL_DAILY_LIMIT || 300),
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
    anon: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

export function reply(status, body) {
  return { statusCode: status, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function ready(config) {
  return Boolean(config.geminiKey && config.url && config.anon);
}

export async function userFromJwt(config, jwt) {
  if (!jwt) return null;
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.anon, Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

export function bearer(header) {
  const value = header || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

export async function session(event) {
  if (event.httpMethod === "OPTIONS") return { early: reply(204, {}) };
  if (event.httpMethod !== "POST") return { early: reply(405, { error: "invalid" }) };
  const config = env();
  if (!ready(config)) return { early: reply(503, { error: "off" }) };
  const jwt = bearer(event.headers?.authorization || event.headers?.Authorization);
  const user = await userFromJwt(config, jwt);
  if (!user) return { early: reply(401, { error: "unauthorized" }) };
  return { config, user, jwt, day: saoPauloDay() };
}

export async function gate(event) {
  const access = await session(event);
  if (access.early) return access;
  if (!access.config.service) return access;
  const quota = await uso(access.config, access.user.id, access.day, false);
  if (!quota.ok && quota.reason === "usage") return access;
  if (!quota.ok) return { early: reply(429, { error: "limit", count: quota.count || 0 }) };
  return access;
}

export async function uso(config, userId, day, consumir) {
  if (!config.service) return { ok: false, reason: "usage" };
  const response = await fetch(`${config.url}/rest/v1/rpc/ai_uso`, {
    method: "POST",
    headers: {
      apikey: config.service,
      Authorization: `Bearer ${config.service}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_user: userId,
      p_day: day,
      p_user_limit: config.userLimit,
      p_global_limit: config.globalLimit,
      p_consumir: consumir,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { ok: false, reason: "usage" };
  return response.json();
}

export async function gemini(config, system, payload, schema) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
      signal: AbortSignal.timeout(12000),
    },
  );
  if (response.status === 429) return { resting: true };
  if (!response.ok) return { fail: true };
  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("");
  try {
    return { json: JSON.parse(text) };
  } catch {
    return { invalid: true };
  }
}

export async function rowsOf(config, jwt, table, query) {
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: { apikey: config.anon, Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export function shiftDay(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function compactFinance(lancamentos, eventos, metas, today) {
  const from = shiftDay(today, -92);
  const to = shiftDay(today, 92);
  const contas = lancamentos
    .filter((row) => row.ativo !== false && row.prazo && row.prazo >= from && row.prazo <= to)
    .slice(0, 201)
    .map((row) => ({
      titulo: String(row.titulo || "").slice(0, 80),
      valor: Number(row.valor) || 0,
      data: row.prazo,
      categoria: row.categoria || "outro",
      direcao: row.tipo,
      pago: Boolean(row.feito),
    }));
  const agenda = eventos.slice(0, 201).map((row) => ({
    titulo: String(row.titulo || "").slice(0, 80),
    valor: row.valor == null ? null : Number(row.valor) || 0,
    data: String(row.inicio || "").slice(0, 10),
    pago: Boolean(row.feito),
  }));
  const month = today.slice(0, 7);
  const sum = (list) => Math.round(list.reduce((total, row) => total + row.valor, 0) * 100) / 100;
  const doMes = contas.filter((row) => row.data.startsWith(month));
  const porCategoria = {};
  for (const row of doMes) {
    const key = `${row.direcao}:${row.categoria}`;
    porCategoria[key] = Math.round(((porCategoria[key] || 0) + row.valor) * 100) / 100;
  }
  const semana = contas.filter((row) => !row.pago && row.data >= today && row.data <= shiftDay(today, 7));
  const resumo = {
    hoje: today,
    fuso: "America/Sao_Paulo",
    totaisDoMes: {
      aPagar: sum(doMes.filter((row) => row.direcao === "pagar" && !row.pago)),
      pago: sum(doMes.filter((row) => row.direcao === "pagar" && row.pago)),
      aReceber: sum(doMes.filter((row) => row.direcao === "receber" && !row.pago)),
      recebido: sum(doMes.filter((row) => row.direcao === "receber" && row.pago)),
    },
    porCategoriaNoMes: porCategoria,
    proximos7dias: semana.slice(0, 20),
    metas: metas.map((row) => ({ id: row.id, valor: Number(row.valor) || 0 })),
  };
  if (contas.length > 200) return { ...resumo, aviso: "Lista omitida. Use apenas os totais." };
  return { ...resumo, contas: contas.slice(0, 200), agenda: agenda.slice(0, 80) };
}

export { CATEGORIAS };
