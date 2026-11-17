export function somarDia(iso, dias) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + dias));
  return date.toISOString().slice(0, 10);
}

export function reais(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor) || 0);
}

export function diaDe(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function horaDe(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function diasEntre(inicio, fim) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000);
}

export function avisosDe(items, agenda, today) {
  const amanha = somarDia(today, 1);
  const contas = (items || []).filter((item) => item.ativo !== false && !item.feito && item.prazo);
  const atrasados = contas
    .filter((item) => item.prazo < today)
    .map((item) => ({
      tipo: "atraso",
      texto: `${item.titulo} está atrasado há ${diasEntre(item.prazo, today)} ${diasEntre(item.prazo, today) === 1 ? "dia" : "dias"}.`,
    }));
  const hojePagar = contas
    .filter((item) => item.prazo === today && item.tipo === "pagar")
    .map((item) => ({ tipo: "hoje", texto: `Hoje vence: ${item.titulo}, ${reais(item.valor)}` }));
  const hojeReceber = contas
    .filter((item) => item.prazo === today && item.tipo === "receber")
    .map((item) => ({ tipo: "hoje", texto: `Hoje era para entrar: ${item.titulo}, ${reais(item.valor)}` }));
  const deAmanha = contas
    .filter((item) => item.prazo === amanha)
    .map((item) => ({
      tipo: "amanha",
      texto: item.tipo === "receber"
        ? `Amanhã era para entrar: ${item.titulo}, ${reais(item.valor)}`
        : `Amanhã: ${item.titulo}, ${reais(item.valor)}`,
    }));
  const eventos = (agenda?.eventos || [])
    .filter((item) => !item.feito && diaDe(item.inicio) === today)
    .map((item) => ({ tipo: "agenda", texto: `${item.titulo} hoje às ${horaDe(item.inicio)}` }));
  const atividades = (agenda?.atividades || [])
    .filter((item) => !item.feito && item.prazo === today)
    .map((item) => ({ tipo: "atividade", texto: `${item.titulo} vence hoje` }));
  const linhas = [...atrasados, ...hojePagar, ...hojeReceber, ...deAmanha, ...eventos, ...atividades];
  const partes = [];
  if (hojePagar.length || hojeReceber.length) partes.push(`${hojePagar.length + hojeReceber.length} na conta`);
  if (eventos.length) partes.push(`${eventos.length} compromisso${eventos.length > 1 ? "s" : ""}`);
  if (atividades.length) partes.push(`${atividades.length} atividade${atividades.length > 1 ? "s" : ""}`);
  if (atrasados.length) partes.push(`${atrasados.length} atrasado${atrasados.length > 1 ? "s" : ""}`);
  const resumo = partes.length ? `Resumo do dia: ${partes.join(", ")}.` : "Nada vence hoje.";
  return { resumo, linhas };
}

export function textoDoDia(avisos) {
  const corpo = [avisos.resumo, ...avisos.linhas.map((linha) => linha.texto)].join(" ");
  return corpo.slice(0, 240);
}
