"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  converter,
  estaOnline,
  formatarValor,
  nomeSensor,
  tempoRelativo,
} from "@/lib/format";
import type { Dispositivo, Sensor } from "@/lib/types";

type Props = {
  dispositivosIniciais: Dispositivo[];
  sensoresIniciais: Sensor[];
};

export default function Painel({ dispositivosIniciais, sensoresIniciais }: Props) {
  const [dispositivos, setDispositivos] = useState(dispositivosIniciais);
  const [sensores, setSensores] = useState(sensoresIniciais);
  const [agora, setAgora] = useState(() => Date.now());
  const [conectado, setConectado] = useState(false);
  const [piscando, setPiscando] = useState<Set<number>>(new Set());

  // Relógio para atualizar "há X s" e o status online/offline
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Atualizações em tempo real (Supabase Realtime)
  useEffect(() => {
    const supabase = createClient();

    const canal = supabase
      .channel("painel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sensores" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const antigo = payload.old as Partial<Sensor>;
            setSensores((lista) => lista.filter((s) => s.id !== antigo.id));
            return;
          }
          const novo = payload.new as Sensor;
          setSensores((lista) => {
            const i = lista.findIndex((s) => s.id === novo.id);
            if (i === -1) return [...lista, novo].sort((a, b) => a.id_sensor - b.id_sensor);
            const copia = lista.slice();
            copia[i] = novo;
            return copia;
          });
          setPiscando((p) => new Set(p).add(novo.id));
          setTimeout(() => {
            setPiscando((p) => {
              const n = new Set(p);
              n.delete(novo.id);
              return n;
            });
          }, 1200);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispositivos" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const antigo = payload.old as Partial<Dispositivo>;
            setDispositivos((lista) => lista.filter((d) => d.id !== antigo.id));
            return;
          }
          const novo = payload.new as Dispositivo;
          setDispositivos((lista) => {
            const i = lista.findIndex((d) => d.id === novo.id);
            if (i === -1) return [...lista, novo];
            const copia = lista.slice();
            copia[i] = { ...copia[i], nome: novo.nome, ultimo_envio: novo.ultimo_envio };
            return copia;
          });
          setAgora(Date.now());
        }
      )
      .subscribe((status) => setConectado(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  const porDispositivo = useMemo(() => {
    const mapa = new Map<string, Sensor[]>();
    for (const s of sensores) {
      if (!s.ativo) continue;
      const l = mapa.get(s.dispositivo_id) ?? [];
      l.push(s);
      mapa.set(s.dispositivo_id, l);
    }
    return mapa;
  }, [sensores]);

  if (dispositivos.length === 0) {
    return (
      <div className="vazio">
        <h2>Nenhum dispositivo cadastrado</h2>
        <p>
          No SQL Editor do Supabase rode{" "}
          <code>select public.criar_dispositivo(&apos;ESP32 Linha 1&apos;);</code> e grave o
          token retornado no ESP32.
        </p>
      </div>
    );
  }

  const online = dispositivos.filter((d) => estaOnline(d.ultimo_envio, agora)).length;

  return (
    <>
      <div className="resumo">
        <div>
          <h1>Painel</h1>
          <p className="sub">
            {online} de {dispositivos.length} dispositivo(s) online
          </p>
        </div>
        <span className={`ao-vivo ${conectado ? "ok" : ""}`}>
          <span className="ao-vivo-ponto" />
          {conectado ? "Ao vivo" : "Conectando…"}
        </span>
      </div>

      {dispositivos.map((d) => {
        const on = estaOnline(d.ultimo_envio, agora);
        const lista = porDispositivo.get(d.id) ?? [];
        return (
          <section key={d.id} className="dispositivo">
            <div className="dispositivo-topo">
              <h2>{d.nome}</h2>
              <span className={`status ${on ? "on" : "off"}`}>{on ? "Online" : "Offline"}</span>
              <span className="sub">último envio {tempoRelativo(d.ultimo_envio, agora)}</span>
            </div>

            {lista.length === 0 ? (
              <p className="sub">Aguardando a primeira leitura deste dispositivo.</p>
            ) : (
              <div className="grade">
                {lista.map((s) => {
                  const valor =
                    s.ultimo_valor === null ? null : converter(s.ultimo_valor, s);
                  return (
                    <Link
                      key={s.id}
                      href={`/sensor/${s.id}`}
                      className={`cartao ${piscando.has(s.id) ? "pisca" : ""} ${on ? "" : "apagado"}`}
                    >
                      <span className="cartao-nome">{nomeSensor(s)}</span>
                      <span className="cartao-valor">
                        {formatarValor(valor, s.casas_decimais)}
                        {s.unidade && <small> {s.unidade}</small>}
                      </span>
                      <span className="cartao-rodape">
                        ID {s.id_sensor} · {tempoRelativo(s.ultimo_dt, agora)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
