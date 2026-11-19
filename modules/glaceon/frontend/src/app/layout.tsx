import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GLACEON",
  description: "Módulo de aprendizagem de infraestrutura como código do EEVEE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
