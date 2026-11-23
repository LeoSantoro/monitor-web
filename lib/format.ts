import type { Sensor } from "./types";

/** Dispositivo é considerado offline após este tempo sem enviar (ESP32 envia a cada 30 s). */
export const LIMITE_OFFLINE_MS = 2 * 60_000;

export function converter(bruto: number, s: Pick<Sensor, "fator" | "deslocamento">) {
  return bruto * s.fator + s.deslocamento;
}

export function formatarValor(v: number | null | undefined, casas: number) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function nomeSensor(s: Pick<Sensor, "nome" | "id_sensor">) {
  return s.nome?.trim() || `Sensor ${s.id_sensor}`;
}

export function estaOnline(ultimo: string | null, agora: number) {
  if (!ultimo) return false;
  return agora - new Date(ultimo).getTime() < LIMITE_OFFLINE_MS;
}

export function tempoRelativo(iso: string | null, agora: number) {
  if (!iso) return "nunca";
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

export function dataHora(iso: string | number) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
