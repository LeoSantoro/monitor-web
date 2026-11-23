"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { converter, dataHora, formatarValor } from "@/lib/format";
import type { Sensor } from "@/lib/types";

const PERIODOS = [
  { id: "1h", rotulo: "1 h", ms: 3_600_000 },
  { id: "6h", rotulo: "6 h", ms: 6 * 3_600_000 },
  { id: "24h", rotulo: "24 h", ms: 24 * 3_600_000 },
  { id: "7d", rotulo: "7 dias", ms: 7 * 86_400_000 },
  { id: "30d", rotulo: "30 dias", ms: 30 * 86_400_000 },
  { id: "custom", rotulo: "Personalizado", ms: 0 },
] as const;

type PeriodoId = (typeof PERIODOS)[number]["id"];

type Ponto = { t: number; media: number; faixa: [number, number] };

type LinhaHistorico = { dt: string; media: number; minimo: number; maximo: number };

/** "YYYY-MM-DDTHH:mm" no fuso local, para <input type="datetime-local"> */
function paraInputLocal(ms: number) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

export default function Historico({ sensor }: { sensor: Sensor }) {
  const [periodo, setPeriodo] = useState<PeriodoId>("24h");
  const [inicioCustom, setInicioCustom] = useState(() => paraInputLocal(Date.now() - 86_400_000));
  const [fimCustom, setFimCustom] = useState(() => paraInputLocal(Date.now()));
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [janela, setJanela] = useState<[number, number]>([0, 0]);

  const carregar = useCallback(async () => {
    let inicio: number;
    let fim: number;
    if (periodo === "custom") {
      inicio = new Date(inicioCustom).getTime();
      fim = new Date(fimCustom).getTime();
      if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) {
        setErro("Intervalo inválido.");
        return;
      }
    } else {
      fim = Date.now();
      inicio = fim - PERIODOS.find((p) => p.id === periodo)!.ms;
    }

    setCarregando(true);
    setErro(null);
    const { data, error } = await createClient().rpc("historico", {
      p_sensor_id: sensor.id,
      p_inicio: new Date(inicio).toISOString(),
      p_fim: new Date(fim).toISOString(),
      p_pontos: 600,
    });
    setCarregando(false);

    if (error) {
      setErro("Erro ao carregar o histórico.");
      console.error(error);
      return;
    }

    setJanela([inicio, fim]);
    setPontos(
      ((data ?? []) as LinhaHistorico[]).map((l) => ({
        t: new Date(l.dt).getTime(),
        media: converter(l.media, sensor),
        faixa: [converter(l.minimo, sensor), converter(l.maximo, sensor)],
      }))
    );
  }, [periodo, inicioCustom, fimCustom, sensor]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Períodos curtos se atualizam sozinhos a cada 30 s
  useEffect(() => {
    if (periodo === "custom" || periodo === "7d" || periodo === "30d") return;
    const t = setInterval(carregar, 30_000);
    return () => clearInterval(t);
  }, [periodo, carregar]);

  const resumo = useMemo(() => {
    if (pontos.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    let soma = 0;
    for (const p of pontos) {
      min = Math.min(min, p.faixa[0]);
      max = Math.max(max, p.faixa[1]);
      soma += p.media;
    }
    return { min, max, media: soma / pontos.length, ultimo: pontos[pontos.length - 1].media };
  }, [pontos]);

  const casas = sensor.casas_decimais;
  const un = sensor.unidade ? ` ${sensor.unidade}` : "";
  const curto = janela[1] - janela[0] <= 36 * 3_600_000;

  return (
    <div className="historico">
      <div className="periodos" role="tablist">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={periodo === p.id}
            className={`chip ${periodo === p.id ? "ativo" : ""}`}
            onClick={() => setPeriodo(p.id)}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      {periodo === "custom" && (
        <div className="custom">
          <label>
            De
            <input
              type="datetime-local"
              value={inicioCustom}
              onChange={(e) => setInicioCustom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="datetime-local"
              value={fimCustom}
              onChange={(e) => setFimCustom(e.target.value)}
            />
          </label>
        </div>
      )}

      <div className="estatisticas">
        <Estat rotulo="Último" valor={resumo?.ultimo} casas={casas} un={un} />
        <Estat rotulo="Mínimo" valor={resumo?.min} casas={casas} un={un} />
        <Estat rotulo="Máximo" valor={resumo?.max} casas={casas} un={un} />
        <Estat rotulo="Média" valor={resumo?.media} casas={casas} un={un} />
      </div>

      <div className="grafico">
        {erro ? (
          <p className="erro">{erro}</p>
        ) : pontos.length === 0 ? (
          <p className="sub centro">{carregando ? "Carregando…" : "Sem leituras neste período."}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pontos} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grade)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={janela}
                tickFormatter={(t: number) =>
                  new Date(t).toLocaleString(
                    "pt-BR",
                    curto
                      ? { hour: "2-digit", minute: "2-digit" }
                      : { day: "2-digit", month: "2-digit", hour: "2-digit" }
                  )
                }
                stroke="var(--texto-fraco)"
                fontSize={12}
                minTickGap={40}
              />
              <YAxis
                stroke="var(--texto-fraco)"
                fontSize={12}
                width={64}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => formatarValor(v, casas)}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--superficie)",
                  border: "1px solid var(--borda)",
                  borderRadius: 8,
                  color: "var(--texto)",
                }}
                labelFormatter={(t) => dataHora(Number(t))}
                formatter={(v, nome) => {
                  if (Array.isArray(v)) {
                    return [
                      `${formatarValor(Number(v[0]), casas)} – ${formatarValor(Number(v[1]), casas)}${un}`,
                      "Mín – Máx",
                    ];
                  }
                  return [`${formatarValor(Number(v), casas)}${un}`, nome === "media" ? "Média" : String(nome)];
                }}
              />
              <Area
                dataKey="faixa"
                stroke="none"
                fill="var(--acento)"
                fillOpacity={0.15}
                isAnimationActive={false}
              />
              <Line
                dataKey="media"
                stroke="var(--acento)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="sub nota">
        Linha: média · faixa sombreada: mínimo e máximo de cada intervalo.
      </p>
    </div>
  );
}

function Estat({
  rotulo,
  valor,
  casas,
  un,
}: {
  rotulo: string;
  valor: number | undefined;
  casas: number;
  un: string;
}) {
  return (
    <div className="estat">
      <span className="estat-rotulo">{rotulo}</span>
      <span className="estat-valor">
        {formatarValor(valor, casas)}
        {valor !== undefined && <small>{un}</small>}
      </span>
    </div>
  );
}
