-- Família Kishiki. Só e-mails em public.acessos, autenticados, leem e gravam.
-- O administrador é euveronese@gmail.com. No máximo 10 e-mails.

create schema if not exists private;

create table public.acessos (
  email text primary key,
  papel text not null default 'membro' check (papel in ('admin', 'membro')),
  created_at timestamptz not null default now()
);

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pagar', 'receber')),
  titulo text not null,
  valor numeric(12,2) not null check (valor >= 0),
  categoria text not null default 'outro',
  prazo date,
  feito boolean not null default false,
  ativo boolean not null default true,
  detalhe text,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.metas (
  id text primary key,
  rotulo text not null,
  valor numeric(12,2) not null check (valor >= 0)
);

create table public.atividades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  prazo date,
  valor numeric(12,2) check (valor is null or valor >= 0),
  feito boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  inicio timestamptz not null,
  valor numeric(12,2) check (valor is null or valor >= 0),
  feito boolean not null default false,
  created_at timestamptz not null default now()
);

create index lancamentos_prazo_idx on public.lancamentos (prazo, ordem);
