export const ADMIN_EMAIL = "euveronese@gmail.com";

export const PAGAR = [
  ["contas", "Contas"],
  ["assinaturas", "Assinaturas"],
  ["dividas", "Dívidas"],
  ["casa", "Casa"],
  ["compras", "Compras"],
  ["saude", "Saúde"],
  ["viagem", "Viagem"],
  ["autoescola", "Autoescola"],
  ["obrigacoes", "Obrigações"],
  ["outro", "Outro"],
];

export const RECEBER = [
  ["salario", "Salário"],
  ["bolsa", "Bolsa"],
  ["investimentos", "Investimentos"],
  ["fechamento", "Fechamento"],
  ["olx", "OLX"],
  ["site", "Site"],
  ["familia", "Família"],
  ["outro", "Outro"],
];

const ALL = [...PAGAR, ...RECEBER];

export function categoriesFor(tipo) {
  return tipo === "receber" ? RECEBER : PAGAR;
}

export function categoryLabel(id) {
  return ALL.find(([value]) => value === id)?.[1] || id;
}

export function defaultCategory(tipo) {
  return categoriesFor(tipo)[0][0];
}

export function categoryOptions(tipo, current) {
  const list = categoriesFor(tipo);
  if (current && !list.some(([value]) => value === current)) return [[current, categoryLabel(current)], ...list];
  return list;
}
