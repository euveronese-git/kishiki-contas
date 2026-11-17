-- Núcleos Veronese. Cole este arquivo no SQL Editor do Supabase.
-- Não apaga lançamentos. Não mexe em quem já criou conta, além de marcar você como super admin.
-- Sem teto de pessoas. Só euveronese@gmail.com cadastra e-mail.
-- O admin de um núcleo lê o cônjuge e os filhos. Não edita a linha deles.
-- Cônjuge, filho, individual e o super admin não leem a planilha de outra pessoa.

create table if not exists public.nucleos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.acessos add column if not exists vinculo text not null default 'individual';
alter table public.acessos add column if not exists nucleo_id uuid;
alter table public.acessos add column if not exists user_id uuid;

alter table public.acessos drop constraint if exists acessos_papel_check;
alter table public.acessos drop constraint if exists acessos_vinculo_check;
alter table public.acessos drop constraint if exists acessos_vinculo_nucleo;
alter table public.acessos drop constraint if exists acessos_nucleo_fk;

update public.acessos
set papel = 'super', vinculo = 'individual', nucleo_id = null
where email = 'euveronese@gmail.com';

update public.acessos a
set user_id = u.id
from auth.users u
where a.user_id is null and lower(u.email) = a.email;

alter table public.acessos
  add constraint acessos_papel_check check (papel in ('super', 'admin', 'membro'));
alter table public.acessos
  add constraint acessos_vinculo_check check (vinculo in ('individual', 'conjuge', 'filho'));
alter table public.acessos
  add constraint acessos_vinculo_nucleo check (
    (papel = 'super' and vinculo = 'individual' and nucleo_id is null)
    or (papel = 'admin' and vinculo = 'individual' and nucleo_id is not null)
    or (papel = 'membro' and vinculo = 'individual' and nucleo_id is null)
    or (papel = 'membro' and vinculo in ('conjuge', 'filho') and nucleo_id is not null)
  );
alter table public.acessos
  add constraint acessos_nucleo_fk foreign key (nucleo_id) references public.nucleos (id);

create unique index if not exists acessos_um_conjuge on public.acessos (nucleo_id) where vinculo = 'conjuge';
create unique index if not exists acessos_um_admin on public.acessos (nucleo_id) where papel = 'admin';

create or replace function private.vincular_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.acessos set user_id = new.id where email = lower(new.email);
  return new;
end;
$$;

drop trigger if exists vincular_acesso on auth.users;
create trigger vincular_acesso
  after insert on auth.users
  for each row execute function private.vincular_acesso();

create or replace function private.eh_super()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.acessos
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and papel = 'super'
  );
$$;

create or replace function private.meu_nucleo()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nucleo_id from public.acessos
  where email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and papel = 'admin'
  limit 1;
$$;

create or replace function private.nucleo_pode_ler(dono uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.acessos eu
    join auth.users pessoa on pessoa.id = dono
    join public.acessos deles on deles.email = lower(pessoa.email)
    where eu.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and eu.papel = 'admin'
      and eu.nucleo_id is not null
      and deles.nucleo_id = eu.nucleo_id
      and deles.vinculo in ('conjuge', 'filho')
  );
$$;

alter table public.nucleos enable row level security;
grant select, insert, delete on public.nucleos to authenticated;

drop policy if exists nucleos_super on public.nucleos;
create policy nucleos_super on public.nucleos
  for all to authenticated
  using (private.eh_super())
  with check (private.eh_super());

drop policy if exists nucleos_ler_chefe on public.nucleos;
create policy nucleos_ler_chefe on public.nucleos
  for select to authenticated
  using (id = private.meu_nucleo());

drop policy if exists acessos_ler on public.acessos;
drop policy if exists acessos_liberar on public.acessos;
drop policy if exists acessos_remover on public.acessos;
drop policy if exists acessos_super on public.acessos;
drop policy if exists acessos_ler_si on public.acessos;
drop policy if exists acessos_ler_nucleo on public.acessos;

create policy acessos_super on public.acessos
  for all to authenticated
  using (private.eh_super())
  with check (private.eh_super());

create policy acessos_ler_si on public.acessos
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy acessos_ler_nucleo on public.acessos
  for select to authenticated
  using (nucleo_id is not null and nucleo_id = private.meu_nucleo());

-- A política antiga era FOR ALL. Separar leitura e escrita: o chefe lê, só o dono grava.
do $$
declare
  tabela text;
begin
  foreach tabela in array array['lancamentos', 'metas', 'atividades', 'eventos']
  loop
    execute format('drop policy if exists %I on public.%I', tabela || '_proprio', tabela);
    execute format('drop policy if exists %I on public.%I', tabela || '_ler', tabela);
    execute format('drop policy if exists %I on public.%I', tabela || '_inserir', tabela);
    execute format('drop policy if exists %I on public.%I', tabela || '_atualizar', tabela);
    execute format('drop policy if exists %I on public.%I', tabela || '_apagar', tabela);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.email_liberado() and (user_id = auth.uid() or private.nucleo_pode_ler(user_id)))',
      tabela || '_ler', tabela
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.email_liberado() and user_id = auth.uid())',
      tabela || '_inserir', tabela
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.email_liberado() and user_id = auth.uid()) with check (private.email_liberado() and user_id = auth.uid())',
      tabela || '_atualizar', tabela
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.email_liberado() and user_id = auth.uid())',
      tabela || '_apagar', tabela
    );
  end loop;
end $$;

-- Arquivos, se a tabela já existir. O chefe lê. Não apaga o arquivo de outra pessoa.
do $$
begin
  if to_regclass('public.files') is not null then
    execute 'drop policy if exists "cada um vê os próprios arquivos" on public.files';
    execute 'drop policy if exists files_ler on public.files';
    execute 'create policy files_ler on public.files for select to authenticated using (user_id = auth.uid() or private.nucleo_pode_ler(user_id))';
  end if;
end $$;
