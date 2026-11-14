-- Uso pessoal da Kishiki. A chave publishable do navegador lê e grava estas tabelas.
-- Não use esta política num site público com vários usuários.

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

create index lancamentos_prazo_idx on public.lancamentos (prazo, ordem);

alter table public.lancamentos enable row level security;
alter table public.metas enable row level security;

create policy lancamentos_pessoal
  on public.lancamentos
  for all
  to anon, authenticated
  using (true)
  with check (true);

create policy metas_pessoal
  on public.metas
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.lancamentos to anon, authenticated;
grant select, insert, update, delete on public.metas to anon, authenticated;
