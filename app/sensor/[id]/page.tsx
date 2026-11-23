import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Historico from "@/components/Historico";
import { createClient } from "@/lib/supabase/server";
import { nomeSensor } from "@/lib/format";
import type { Sensor } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SensorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sensorId = Number(id);
  if (!Number.isInteger(sensorId)) notFound();

  const supabase = await createClient();
  const [{ data: auth }, { data }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("sensores")
      .select(
        "id, dispositivo_id, id_sensor, nome, unidade, fator, deslocamento, casas_decimais, ativo, ultimo_valor, ultimo_dt, dispositivos(nome)"
      )
      .eq("id", sensorId)
      .maybeSingle(),
  ]);

  const sensor = data as unknown as (Sensor & { dispositivos: { nome: string } | null }) | null;
  if (!sensor) notFound();

  const disp = sensor.dispositivos;

  return (
    <>
      <Header email={auth.user?.email} />
      <main className="conteudo">
        <Link href="/" className="voltar">
          ← Painel
        </Link>
        <div className="resumo">
          <div>
            <h1>{nomeSensor(sensor)}</h1>
            <p className="sub">
              {disp?.nome ?? "Dispositivo"} · ID {sensor.id_sensor}
              {sensor.unidade ? ` · ${sensor.unidade}` : ""}
            </p>
          </div>
        </div>
        <Historico sensor={sensor} />
      </main>
    </>
  );
}
