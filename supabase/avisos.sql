-- Aviso diário no celular. Cole no SQL Editor e rode uma vez.
-- O navegador só grava a própria inscrição. Quem envia o aviso às 8h
-- (America/Sao_Paulo) é a função avisos-diarios, com a service_role.
-- Este arquivo não liga o relógio. Sem o agendamento, o cartão dentro do app continua.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "cada um lê a própria inscrição" on public.push_subscriptions;
create policy "cada um lê a própria inscrição"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

drop policy if exists "cada um cria a própria inscrição" on public.push_subscriptions;
create policy "cada um cria a própria inscrição"
  on public.push_subscriptions for insert
  with check (user_id = auth.uid());

drop policy if exists "cada um atualiza a própria inscrição" on public.push_subscriptions;
create policy "cada um atualiza a própria inscrição"
  on public.push_subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "cada um apaga a própria inscrição" on public.push_subscriptions;
create policy "cada um apaga a própria inscrição"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());
