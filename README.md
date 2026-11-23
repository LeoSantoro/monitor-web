# Monitor de Sensores

Painel web (Next.js no Vercel) com banco Supabase para os dados enviados pelo ESP32 (`../monitorK`).

```
ESP32 ──POST /api/leituras (Bearer token)──► Vercel (Next.js) ──service role──► Supabase (Postgres)
                                                  ▲                                   │
                         navegador (login) ───────┘◄──────── Realtime ────────────────┘
```

## 1. Supabase

1. Crie um projeto em https://supabase.com.
2. **SQL Editor** → cole e execute todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
3. Cadastre o dispositivo e **guarde o token** que aparece (ele não é mostrado de novo):
   ```sql
   select public.criar_dispositivo('ESP32 Linha 1');
   ```
   Para gerar outro token depois: `select public.novo_token('<id do dispositivo>');`
4. **Authentication → Sign In / Providers**: desative *Allow new users to sign up*.
5. **Authentication → Users → Add user**: crie os usuários que vão acessar o painel (e-mail e senha, marcando *Auto Confirm*).
6. **Project Settings → API**: copie a *Project URL*, a chave *anon* e a *service_role*.

## 2. Vercel

1. Suba a pasta `web/` para um repositório no GitHub (ou use `npx vercel` dentro dela).
2. Em https://vercel.com → **Add New → Project** → importe o repositório. Se o repositório tiver o firmware junto, defina **Root Directory = `web`**.
3. Em **Environment Variables**, adicione:

   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon |
   | `SUPABASE_SERVICE_ROLE_KEY` | chave service_role (secreta) |

4. Deploy. Anote o domínio (ex.: `monitor-sensores.vercel.app`).

## 3. ESP32

1. Em `monitorK/src/main.cpp`, troque `SEU-PROJETO.vercel.app` em `serverK.envia` pelo seu domínio e grave o firmware.
2. Na página local do ESP32 (`/info`), cole o **token** do passo 1.3 e salve.
3. A cada 30 s o ESP32 envia as leituras. Os sensores aparecem no painel automaticamente.

### Formato do envio

```http
POST /api/leituras
Authorization: Bearer <token>
Content-Type: application/json

{ "dt": "2026-11-23T14:05:00-03:00",
  "leituras": [ { "id_sensor": 1, "valor": 512 }, { "id_sensor": 2, "valor": 1023 } ] }
```

`dt` é opcional; se faltar ou for inválido (relógio do ESP32 não sincronizado), vale o horário de chegada.
Respostas: `200` ok · `400` JSON inválido · `401` token inválido · `500` erro no banco.

Teste rápido pelo PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri https://SEU-PROJETO.vercel.app/api/leituras -Headers @{Authorization="Bearer SEU_TOKEN"} -ContentType "application/json" -Body '{"leituras":[{"id_sensor":1,"valor":123}]}'
```

## 4. Nomes, unidades e escala dos sensores

O ESP32 envia o valor bruto (ADC). Em **Table Editor → sensores** edite cada linha:

| Coluna | Uso |
|---|---|
| `nome` | Nome exibido (ex.: "Temperatura cabeçote") |
| `unidade` | Ex.: `°C`, `bar`, `%` |
| `fator`, `deslocamento` | Valor exibido = bruto × fator + deslocamento |
| `casas_decimais` | Casas exibidas |
| `ativo` | `false` esconde o sensor do painel |

## Desenvolvimento local

Requer Node.js 20+.

```powershell
copy .env.example .env.local   # preencha as chaves
npm install
npm run dev
```

## Volume de dados

16 sensores a cada 30 s ≈ 46 mil linhas/dia (~1,4 milhão/mês, uns 100 MB/mês). O plano gratuito do Supabase tem 500 MB:
ative a retenção comentada no final de `schema.sql` (pg_cron) se precisar.
