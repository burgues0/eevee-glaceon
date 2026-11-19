"use client";

import React from "react";
import { CheckCircle2, ChevronRight, Hourglass, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { WorkerResourceNode, WorkerResourceStatus } from "./worker-resource.types";

interface WorkspaceResourcesPanelProps {
  title: string;
  loading: boolean;
  hasRun: boolean;
  score: number;
  passes: number;
  fails: number;
  resources: WorkerResourceNode[] | undefined;
  report: string | undefined;
}

function getScoreValue(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return score <= 1 ? score * 100 : score;
}

function StatusIcon({ status }: { status?: WorkerResourceStatus }) {
  if (status === "ok") return <CheckCircle2 className="size-4 shrink-0 text-success" />;
  if (status === "error") return <XCircle className="size-4 shrink-0 text-destructive" />;
  return <Hourglass className="size-4 shrink-0 text-muted-foreground" />;
}

interface ResourceTreeNodeProps {
  node: WorkerResourceNode;
  level: number;
  selectedId: string | null;
  onSelect: (node: WorkerResourceNode) => void;
}

function ResourceTreeNode({ node, level, selectedId, onSelect }: ResourceTreeNodeProps) {
  const [isOpen, setIsOpen] = React.useState(true);
  const hasChildren = Boolean(node.children?.length);
  const isSelected = node.id === selectedId;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-primary/20 transition-colors",
          isSelected && "bg-primary/20",
          hasChildren && "font-medium",
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (hasChildren) setIsOpen((current) => !current);
          onSelect(node);
        }}
      >
        {hasChildren ? (
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <StatusIcon status={node.status} />
        <span className="truncate text-sm text-foreground">{node.label}</span>
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children!.map((child) => (
            <ResourceTreeNode key={child.id} node={child} level={level + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function findNodeById(nodes: WorkerResourceNode[], id: string): WorkerResourceNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function WorkspaceResourcesPanel({
  title,
  loading,
  hasRun,
  score,
  passes,
  fails,
  resources,
  report,
}: WorkspaceResourcesPanelProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const selectedNode = React.useMemo(() => {
    if (!resources || !selectedId) return null;
    return findNodeById(resources, selectedId);
  }, [resources, selectedId]);

  const scoreValue = getScoreValue(score);
  const hasResources = Boolean(resources?.length);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border/25 px-4 py-2">
        <span className="min-w-0 truncate text-sm text-muted-foreground">Tarefa: {title}</span>
        <Progress value={scoreValue} className="h-2 w-40" />
        <span className="text-xs text-muted-foreground">{scoreValue.toFixed(0)}%</span>
      </div>

      {!hasRun ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {loading ? "Executando..." : "Rode o preview (botão Rodar) pra ver os recursos reconhecidos e o status de cada um."}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[2fr_1fr]">
          <div className="grid min-h-0 grid-cols-1 divide-y divide-border/25 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="flex min-h-0 flex-col">
              <div className="border-b border-border/25 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recursos
              </div>
              <ScrollArea className="min-h-0 flex-1">
                {hasResources ? (
                  resources!.map((node) => (
                    <ResourceTreeNode
                      key={node.id}
                      node={node}
                      level={0}
                      selectedId={selectedId}
                      onSelect={(selected) => setSelectedId(selected.id)}
                    />
                  ))
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">Nenhum recurso reconhecido nesta execução.</p>
                )}
              </ScrollArea>
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-border/25 px-3 py-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Detalhes</span>
                <div className="flex gap-2">
                  <Badge variant="outline">{passes} aprovados</Badge>
                  <Badge variant="outline">{fails} reprovados</Badge>
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                {selectedNode ? (
                  <div className="space-y-3 p-3 text-sm">
                    <div>
                      status: {selectedNode.status ?? "?"}
                      {selectedNode.type && (
                        <>
                          <br />
                          tipo: {selectedNode.type}
                        </>
                      )}
                    </div>

                    {Boolean(selectedNode.attributes?.length) && (
                      <div>
                        <p className="text-muted-foreground">atributos declarados:</p>
                        {selectedNode.attributes!.map((attribute) => (
                          <div key={attribute.key} className="pl-3">
                            {attribute.key} = &quot;{attribute.value}&quot;
                          </div>
                        ))}
                      </div>
                    )}

                    {Boolean(selectedNode.relatedResources?.length) && (
                      <div>
                        <p className="text-muted-foreground">recursos associados:</p>
                        {selectedNode.relatedResources!.map((related) => (
                          <div key={related.key} className="pl-3">
                            {related.key} = {related.value}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">Selecione um recurso pra ver os detalhes.</p>
                )}
              </ScrollArea>
            </div>
          </div>

          <div className="flex min-h-0 flex-col border-t border-border/25">
            <div className="border-b border-border/25 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Logs
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <pre className="whitespace-pre-wrap break-words p-3 text-xs leading-5 text-foreground">
                {selectedNode?.logs || report || "Nenhum log disponível."}
              </pre>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
