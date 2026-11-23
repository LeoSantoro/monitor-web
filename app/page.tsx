import Header from "@/components/Header";
import Painel from "@/components/Painel";
import { createClient } from "@/lib/supabase/server";
import type { Dispositivo, Sensor } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();

  const [{ data: auth }, { data: dispositivos }, { data: sensores }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("dispositivos").select("id, nome, ultimo_envio").order("nome"),
    supabase
      .from("sensores")
      .select(
        "id, dispositivo_id, id_sensor, nome, unidade, fator, deslocamento, casas_decimais, ativo, ultimo_valor, ultimo_dt"
      )
      .order("id_sensor"),
  ]);

  return (
    <>
      <Header email={auth.user?.email} />
      <main className="conteudo">
        <Painel
          dispositivosIniciais={(dispositivos ?? []) as Dispositivo[]}
          sensoresIniciais={(sensores ?? []) as Sensor[]}
        />
      </main>
    </>
  );
}
