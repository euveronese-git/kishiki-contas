-- Casa Veronese: nuvem privada por usuário.
-- Cole este arquivo no SQL Editor do Supabase e rode uma vez.
-- Não cria pasta compartilhada. A soma admin 500 MB + 9 membros de 50 MB fica em 950 MB,
-- abaixo de cerca de 1 GB do plano grátis.

-- 1. Metadados dos arquivos. O binário fica no bucket "arquivos".
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null unique,
  name text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 10485760),
  mime text not null,
  created_at timestamptz not null default now()
);

alter table public.files enable row level security;

drop policy if exists "cada um vê os próprios arquivos" on public.files;
drop policy if exists "cada um envia os próprios arquivos" on public.files;
drop policy if exists "cada um apaga os próprios arquivos" on public.files;

create policy "cada um vê os próprios arquivos"
  on public.files for select
  using (user_id = auth.uid());

create policy "cada um envia os próprios arquivos"
  on public.files for insert
  with check (user_id = auth.uid());

create policy "cada um apaga os próprios arquivos"
  on public.files for delete
  using (user_id = auth.uid());

-- 2. Cota por pessoa. O admin começa com 500 MB; os demais, com 50 MB.
create table if not exists public.storage_quotas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  quota_mb integer not null check (quota_mb > 0 and quota_mb <= 500),
  updated_at timestamptz not null default now()
);

alter table public.storage_quotas enable row level security;

drop policy if exists "cada um lê a própria cota" on public.storage_quotas;
drop policy if exists "admin ajusta cotas" on public.storage_quotas;

create policy "cada um lê a própria cota"
  on public.storage_quotas for select
  using (user_id = auth.uid());

-- Só o administrador (e-mail em acessos) altera cotas, e a soma não passa de 950 MB.
create policy "admin ajusta cotas"
  on public.storage_quotas for update
  using (exists (select 1 from public.acessos where email = lower(auth.jwt() ->> 'email') and papel in ('admin', 'super')))
  with check (
    exists (select 1 from public.acessos where email = lower(auth.jwt() ->> 'email') and papel in ('admin', 'super'))
    and (
      select coalesce(sum(quota_mb), 0) from public.storage_quotas
    ) <= 950
  );

-- 3. Recusa o insert quando a soma dos arquivos passa da cota.
create or replace function public.travar_cota_arquivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  usado bigint;
  limite bigint;
begin
  select coalesce(sum(size_bytes), 0) into usado from public.files where user_id = new.user_id;
  select coalesce(quota_mb, 50) * 1048576 into limite from public.storage_quotas where user_id = new.user_id;
  if limite is null then
    limite := 50 * 1048576;
  end if;
  if usado + new.size_bytes > limite then
    raise exception 'Cota de armazenamento esgotada';
  end if;
  return new;
end;
$$;

drop trigger if exists files_cota on public.files;
create trigger files_cota
  before insert on public.files
  for each row execute function public.travar_cota_arquivo();

-- 4. Bucket privado. Crie também em Storage > New bucket, nome "arquivos", público desligado,
-- se este insert não for permitido no SQL Editor.
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

-- O caminho tem de começar com o id do usuário: users ficam em {user_id}/arquivo.
drop policy if exists "ler o próprio objeto" on storage.objects;
drop policy if exists "enviar o próprio objeto" on storage.objects;
drop policy if exists "apagar o próprio objeto" on storage.objects;

create policy "ler o próprio objeto"
  on storage.objects for select
  using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "enviar o próprio objeto"
  on storage.objects for insert
  with check (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "apagar o próprio objeto"
  on storage.objects for delete
  using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);
