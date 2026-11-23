import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEITURAS = 200;

type Leitura = { id_sensor: number; valor: number };

function erro(status: number, mensagem: string) {
  return Response.json({ status: "erro", mensagem }, { status });
}

/**
 * Recebe as leituras do ESP32.
 *
 * Header:  Authorization: Bearer <token do dispositivo>
 * Body:    { "dt": "2026-11-23T14:05:00-03:00",       (opcional)
 *            "leituras": [ { "id_sensor": 1, "valor": 512 }, ... ] }
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token.length < 32) return erro(401, "token ausente");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return erro(400, "JSON inválido");
  }

  const dados = body as { dt?: unknown; leituras?: unknown };
  if (!Array.isArray(dados.leituras) || dados.leituras.length === 0) {
    return erro(400, "campo 'leituras' deve ser um array não vazio");
  }
  if (dados.leituras.length > MAX_LEITURAS) {
    return erro(400, `máximo de ${MAX_LEITURAS} leituras por envio`);
  }

  const leituras: Leitura[] = [];
  for (const item of dados.leituras) {
    const l = item as { id_sensor?: unknown; valor?: unknown };
    const id = Number(l.id_sensor);
    const valor = Number(l.valor);
    if (!Number.isInteger(id) || id < 0 || id > 65535 || !Number.isFinite(valor)) {
      return erro(400, "leitura inválida: " + JSON.stringify(item));
    }
    leituras.push({ id_sensor: id, valor });
  }

  // Usa o horário do ESP32 só se for plausível (relógio sincronizado);
  // senão o banco usa o horário de chegada.
  let dt: string | null = null;
  if (typeof dados.dt === "string") {
    const t = Date.parse(dados.dt);
    const agora = Date.now();
    if (!Number.isNaN(t) && t > Date.UTC(2020, 0, 1) && t < agora + 5 * 60_000) {
      dt = new Date(t).toISOString();
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data, error } = await supabase.rpc("registrar_leituras", {
    p_token_hash: tokenHash,
    p_dt: dt,
    p_leituras: leituras,
  });

  if (error) {
    if (error.message.includes("token_invalido")) return erro(401, "token inválido");
    console.error("registrar_leituras:", error);
    return erro(500, "falha ao gravar");
  }

  return Response.json({ status: "ok", inseridas: data });
}
