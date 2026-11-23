import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monitor de Sensores",
  description: "Monitoramento dos sensores enviados pelos ESP32",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
