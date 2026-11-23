export type Dispositivo = {
  id: string;
  nome: string;
  ultimo_envio: string | null;
};

export type Sensor = {
  id: number;
  dispositivo_id: string;
  id_sensor: number;
  nome: string | null;
  unidade: string | null;
  fator: number;
  deslocamento: number;
  casas_decimais: number;
  ativo: boolean;
  ultimo_valor: number | null;
  ultimo_dt: string | null;
};
