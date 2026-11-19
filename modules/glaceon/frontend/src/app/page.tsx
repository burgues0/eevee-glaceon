"use client";

import React from "react";
import Link from "next/link";
import { glaceonApi, CatalogEntry } from "@/lib/glaceon-api";

export default function CatalogPage() {
  const [entries, setEntries] = React.useState<CatalogEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    glaceonApi
      .listCatalog()
      .then(setEntries)
      .catch(() => setError("Não foi possível carregar o catálogo. Sua sessão pode ter expirado."));
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">GLACEON</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Módulo de infraestrutura como código (Terraform/Ansible) do EEVEE.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!entries && !error && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {entries?.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma atividade disponível pra você ainda.</p>
      )}

      <ul className="space-y-2">
        {entries?.map((entry) => (
          <li key={entry.externalActivityId}>
            <Link
              href={`/activities/${entry.externalActivityId}`}
              className="block rounded-md border border-border/50 bg-secondary/40 px-4 py-3 transition-colors hover:border-primary hover:bg-secondary/70"
            >
              <span className="font-medium text-foreground">{entry.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
