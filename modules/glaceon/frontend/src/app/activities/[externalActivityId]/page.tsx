"use client";

import React from "react";
import { useParams } from "next/navigation";

import { ActivityEditor } from "@/components/glaceon/activity-editor";
import { WorkspaceResourcesPanel } from "@/components/glaceon/workspace-resources-panel";
import { glaceonApi, ActivityForStudent, RunResult, SubmitResult } from "@/lib/glaceon-api";

export default function ActivityWorkspacePage() {
  const { externalActivityId } = useParams<{ externalActivityId: string }>();

  const [activity, setActivity] = React.useState<ActivityForStudent | null>(null);
  const [content, setContent] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RunResult | SubmitResult | null>(null);
  const [lastSubmit, setLastSubmit] = React.useState<SubmitResult | null>(null);

  React.useEffect(() => {
    glaceonApi
      .getActivity(externalActivityId)
      .then((data) => {
        setActivity(data);
        setContent(data.boilerplateContent);
      })
      .catch(() => setError("Não foi possível carregar esta atividade. Sua sessão pode ter expirado."));
  }, [externalActivityId]);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      setResult(await glaceonApi.run(externalActivityId, content));
    } catch {
      setError("A execução falhou. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const submitResult = await glaceonApi.submit(externalActivityId, content);
      setResult(submitResult);
      setLastSubmit(submitResult);
    } catch {
      setError("O envio falhou. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (!activity) {
    return (
      <main className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        {error ?? "Carregando..."}
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border/25 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-primary">{activity.title}</h1>
          <p className="text-sm text-muted-foreground">{activity.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {lastSubmit && (
            <span className="text-sm text-muted-foreground">
              Última tentativa: {lastSubmit.attempt} · {(lastSubmit.score * 100).toFixed(0)}%
            </span>
          )}
          <button
            onClick={handleRun}
            disabled={loading}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
          >
            Rodar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </header>

      {error && <p className="px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="min-h-0 border-r border-border/25">
          <ActivityEditor variant={activity.variant} value={content} onChange={setContent} />
        </div>
        <WorkspaceResourcesPanel
          title={activity.title}
          loading={loading}
          hasRun={Boolean(result)}
          score={result?.score ?? 0}
          passes={result?.passes ?? 0}
          fails={result?.fails ?? 0}
          resources={result?.resources}
          report={result?.report}
        />
      </div>
    </main>
  );
}
