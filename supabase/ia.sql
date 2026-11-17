-- IA Veronese. Cole este arquivo no SQL Editor do Supabase e rode uma vez.
-- A IA não grava lançamentos. Estas tabelas só contam usos e guardam o texto do resumo.
-- A escrita do contador passa pela função ai_uso, chamada com a chave service_role
-- dentro da Netlify Function. O navegador só consegue ler a própria linha.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

drop policy if exists "cada um lê o próprio uso" on public.ai_usage;
create policy "cada um lê o próprio uso"
  on public.ai_usage for select
  using (user_id = auth.uid());

create table if not exists public.ai_summaries (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  text text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.ai_summaries enable row level security;

drop policy if exists "cada um lê o próprio resumo" on public.ai_summaries;
create policy "cada um lê o próprio resumo"
  on public.ai_summaries for select
  using (user_id = auth.uid());

-- Incremento atômico. p_consumir false só consulta. true soma 1 se ainda houver cota.
create or replace function public.ai_uso(
  p_user uuid,
  p_day date,
  p_user_limit integer,
  p_global_limit integer,
  p_consumir boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  atual integer := 0;
  total integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  perform pg_advisory_xact_lock(481516, hashtext(p_day::text));

  select coalesce(sum(count), 0) into total
  from public.ai_usage
  where day = p_day;

  select coalesce(count, 0) into atual
  from public.ai_usage
  where user_id = p_user and day = p_day;

  if total >= p_global_limit then
    return jsonb_build_object('ok', false, 'reason', 'global', 'count', atual);
  end if;
  if atual >= p_user_limit then
    return jsonb_build_object('ok', false, 'reason', 'user', 'count', atual);
  end if;
  if not p_consumir then
    return jsonb_build_object('ok', true, 'count', atual);
  end if;

  insert into public.ai_usage (user_id, day, count)
  values (p_user, p_day, 1)
  on conflict (user_id, day)
  do update set count = public.ai_usage.count + 1
  where public.ai_usage.count < p_user_limit
  returning count into atual;

  if atual is null then
    return jsonb_build_object('ok', false, 'reason', 'user', 'count', p_user_limit);
  end if;
  return jsonb_build_object('ok', true, 'count', atual);
end;
$$;

revoke all on function public.ai_uso(uuid, date, integer, integer, boolean) from public;
revoke all on function public.ai_uso(uuid, date, integer, integer, boolean) from anon;
revoke all on function public.ai_uso(uuid, date, integer, integer, boolean) from authenticated;
grant execute on function public.ai_uso(uuid, date, integer, integer, boolean) to service_role;
