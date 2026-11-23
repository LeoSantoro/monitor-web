-- =====================================================================
-- Monitor de Sensores — schema do Supabase
-- Execute este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

-- Cada ESP32 é um dispositivo. O token fica salvo apenas como hash SHA-256.
create table if not exists public.dispositivos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  token_hash    text not null unique,
  ultimo_envio  timestamptz,
  criado_em     timestamptz not null default now()
);

-- Sensores são criados automaticamente na primeira leitura recebida.
-- Edite nome, unidade, fator e deslocamento pelo Table Editor do Supabase.
-- Valor exibido = valor_bruto * fator + deslocamento
create table if not exists public.sensores (
  id              bigint generated always as identity primary key,
  dispositivo_id  uuid not null references public.dispositivos(id) on delete cascade,
  id_sensor       integer not null,          -- "id" configurado no ESP32
  nome            text,
  unidade         text,
  fator           double precision not null default 1,
  deslocamento    double precision not null default 0,
  casas_decimais  smallint not null default 1,
  ativo           boolean not null default true,  -- false = oculto no painel
  ultimo_valor    double precision,               -- bruto
  ultimo_dt       timestamptz,
  criado_em       timestamptz not null default now(),
  unique (dispositivo_id, id_sensor)
);

create table if not exists public.leituras (
  id         bigint generated always as identity primary key,
  sensor_id  bigint not null references public.sensores(id) on delete cascade,
  valor      double precision not null,           -- bruto
  dt         timestamptz not null default now()
);

create index if not exists leituras_sensor_dt_idx on public.leituras (sensor_id, dt desc);

-- ---------------------------------------------------------------------
-- Segurança (RLS): usuários logados só leem; gravação só via API (service role)
-- ---------------------------------------------------------------------

alter table public.dispositivos enable row level security;
alter table public.sensores     enable row level security;
alter table public.leituras     enable row level security;

drop policy if exists "autenticado le dispositivos" on public.dispositivos;
create policy "autenticado le dispositivos" on public.dispositivos
  for select to authenticated using (true);

drop policy if exists "autenticado le sensores" on public.sensores;
create policy "autenticado le sensores" on public.sensores
  for select to authenticated using (true);

drop policy if exists "autenticado le leituras" on public.leituras;
create policy "autenticado le leituras" on public.leituras
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Gravação de leituras (chamada pela rota /api/leituras do Vercel)
-- ---------------------------------------------------------------------

create or replace function public.registrar_leituras(
  p_token_hash text,
  p_dt         timestamptz,
  p_leituras   jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disp  uuid;
  v_dt    timestamptz := coalesce(p_dt, now());
  v_count integer;
begin
  select id into v_disp from dispositivos where token_hash = p_token_hash;
  if v_disp is null then
    raise exception 'token_invalido' using errcode = '28000';
  end if;

  with dados as (
    select distinct on (id_sensor) id_sensor, valor
    from (
      select (e->>'id_sensor')::integer        as id_sensor,
             (e->>'valor')::double precision   as valor
      from jsonb_array_elements(p_leituras) as e
    ) x
    order by id_sensor
  ),
  sens as (
    insert into sensores (dispositivo_id, id_sensor, nome, ultimo_valor, ultimo_dt)
    select v_disp, d.id_sensor, 'Sensor ' || d.id_sensor, d.valor, v_dt
    from dados d
    on conflict (dispositivo_id, id_sensor) do update
      set ultimo_valor = excluded.ultimo_valor,
          ultimo_dt    = excluded.ultimo_dt
    returning id, id_sensor
  )
  insert into leituras (sensor_id, valor, dt)
  select s.id, d.valor, v_dt
  from dados d
  join sens s using (id_sensor);

  get diagnostics v_count = row_count;

  update dispositivos set ultimo_envio = now() where id = v_disp;

  return v_count;
end;
$$;

revoke all on function public.registrar_leituras(text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_leituras(text, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Histórico agregado para os gráficos (respeita RLS do usuário logado)
-- ---------------------------------------------------------------------

create or replace function public.historico(
  p_sensor_id bigint,
  p_inicio    timestamptz,
  p_fim       timestamptz,
  p_pontos    integer default 600
) returns table (dt timestamptz, media double precision, minimo double precision, maximo double precision)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_bin(
      greatest((p_fim - p_inicio) / greatest(least(p_pontos, 900), 1), interval '1 second'),
      l.dt,
      p_inicio
    ) as dt,
    avg(l.valor),
    min(l.valor),
    max(l.valor)
  from leituras l
  where l.sensor_id = p_sensor_id
    and l.dt >= p_inicio
    and l.dt <  p_fim
  group by 1
  order by 1;
$$;

revoke all on function public.historico(bigint, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.historico(bigint, timestamptz, timestamptz, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Cadastro de dispositivos (rodar manualmente no SQL Editor)
--   select public.criar_dispositivo('ESP32 Linha 1');   -> devolve o token
--   select public.novo_token('<uuid do dispositivo>');  -> gera token novo
-- O token só aparece nesse momento; guarde e grave no ESP32.
-- ---------------------------------------------------------------------

create or replace function public.criar_dispositivo(p_nome text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into dispositivos (nome, token_hash)
  values (p_nome, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return v_token;
end;
$$;

create or replace function public.novo_token(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update dispositivos
     set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
   where id = p_id;
  if not found then
    raise exception 'dispositivo não encontrado';
  end if;
  return v_token;
end;
$$;

revoke all on function public.criar_dispositivo(text) from public, anon, authenticated;
revoke all on function public.novo_token(uuid)        from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Realtime: o painel escuta mudanças em sensores e dispositivos
-- ---------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.sensores;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.dispositivos;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- (Opcional) Retenção: apagar leituras com mais de 180 dias todo dia às 3h.
-- Ative a extensão pg_cron em Database > Extensions e descomente:
-- select cron.schedule('limpa-leituras', '0 3 * * *',
--   $$delete from public.leituras where dt < now() - interval '180 days'$$);
-- ---------------------------------------------------------------------
