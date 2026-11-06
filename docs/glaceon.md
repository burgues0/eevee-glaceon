# GLACEON — módulo de laboratórios de Terraform e Ansible

GLACEON é o módulo que estende o EEVEE com dois novos tipos de exercício: `TERRAFORM` (provisionamento de infraestrutura via código) e `ANSIBLE` (gerência de configuração). Segue o mesmo mecanismo que todo exercício do EEVEE já usa: Job Kubernetes efêmero por submissão, escolhido via `WorkerType` no padrão Strategy do Assignment Runner. Este documento registra as decisões de arquitetura específicas de GLACEON e o que um contribuidor precisa saber pra tocar esse código.

!!! info "Origem"
    Este módulo nasceu como projeto de TCC. O registro de decisões do ponto de vista da pesquisa (justificativas, alternativas descartadas, ligação com a monografia) fica em `docs/decisoes-tecnicas.md` do repositório da monografia, não duplicado aqui. Esta página é a referência de implementação pra quem for tocar o código depois.

## Emulação de recursos cloud (Terraform)

Exercícios de Terraform não podem bater contra uma conta AWS real (sem custo, sem credencial do aluno). A solução adotada é o [Floci](https://github.com/floci-io/floci), um emulador local de API AWS, **embutido na própria imagem do worker** — sem container sidecar.

### Por que embutido, não sidecar

O EEVEE já resolveu esse mesmo problema uma vez, pra Postgres: `PostgresqlContainerStrategy` (`assignment-runner/src/worker/strategies/postgresql-container.strategy.ts`) roda o Postgres dentro da própria imagem do worker, iniciado por um script de entrypoint (`eevee-postgresql-entrypoint`) antes do comando real. `KubernetesJobOptions` não tem conceito de segundo container no Job — adicionar isso seria infraestrutura nova sem precedente no projeto. GLACEON segue o padrão já existente em vez de criar um novo.

### Por que Floci, não LocalStack

Mesma arquitetura e mesmo endpoint padrão (`http://localhost:4566`, variáveis `AWS_ENDPOINT_URL`/`AWS_DEFAULT_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) de qualquer emulador AWS local. GLACEON não precisa de fidelidade de protocolo "wire" nem da cobertura completa de serviços de um provedor real — o aluno aprende o conceito de criar/gerenciar o recurso, não vai plugar uma aplicação real nisso. Isso relaxa bastante o requisito de compatibilidade.

### Como funciona

1. `images/terraform-default/Dockerfile` usa build multi-stage: extrai o binário nativo (`/app/application` na imagem oficial, renomeado pra `floci-aws`) de `floci/floci:latest`. **Esse binário é linkado contra glibc** (a imagem oficial do Floci usa RHEL) — por isso a imagem final do worker não pode ser Alpine/musl como as outras imagens do EEVEE. A base escolhida foi `debian:bookworm-slim`; o Terraform é baixado direto da HashiCorp (release oficial) num estágio de build separado, e a AWS CLI vem do pacote `awscli` do Debian. Não precisa montar `/var/run/docker.sock` — os exercícios não dependem de serviços que exigem container real, como Lambda.
2. `eevee-terraform-entrypoint` inicia o Floci em background (`-Dquarkus.http.host=127.0.0.1`, só acessível de dentro do próprio container) e espera responder fazendo polling em `GET /_floci/init` até a resposta conter `"ready":true` — esse é o mesmo endpoint que o healthcheck oficial da imagem do Floci usa, confirmado lendo o script `healthcheck.sh` dela. Só então executa o comando real (`exec "$@"`).
3. O bloco de provider do Terraform (`skip_credentials_validation`, `skip_requesting_account_id`, `skip_metadata_api_check = true`, região fixa, credenciais fake) faz parte do **boilerplate padrão do exercício** mostrado ao aluno (`WORKER_DEFAULT_TEMPLATE_CONTENT_MAP[WorkerType.TERRAFORM]` no frontend) — não é um arquivo injetado escondido. O aluno vê e lê essa configuração.
4. Scripts de validação que chamam a AWS CLI diretamente (não via provider Terraform) precisam passar `--endpoint-url http://localhost:4566` explícito — ver nota na tabela abaixo.
5. Cleanup: nenhum código novo. O TTL/deadline do Job (`ttlSecondsAfterFinished`/`activeDeadlineSeconds`, mesmos campos que `PostgresqlContainerStrategy` já usa) encerra o container, e o Floci junto com ele.

Testado manualmente (`docker buildx build` + `docker run` com `/app/src`/`/app/test` montados): build passa, Floci sobe e fica pronto em menos de 1s, `terraform apply` cria o recurso (EC2 emulado como metadata-only, sem container real, já que não há socket do Docker montado — esperado), e o script de validação via AWS CLI confirma o estado real do recurso. Testado também o caso de falha: exercício com `instance_type` errado faz o script de validação falhar corretamente (não é exit-code-only).

!!! warning "Kubernetes `command` sobrescreve `ENTRYPOINT`"
    O `docker run` isolado passou mesmo com `buildExecutionJobCommand` retornando só `['/app/trigger.sh']`, porque o Docker honra `ENTRYPOINT`+`CMD` normalmente. Dentro de um Job Kubernetes real isso falha: o campo `command` do container **sobrescreve** o `ENTRYPOINT` da imagem (diferente de `args`, que só sobrescreve `CMD`), então `eevee-terraform-entrypoint` nunca executava e o Floci não subia — `terraform apply` batia em `connection refused` na porta 4566. Só foi pego testando dentro do minikube. Corrigido retornando `['/usr/local/bin/eevee-terraform-entrypoint', '/app/trigger.sh']`, mesmo padrão que `PostgresqlContainerStrategy.withPostgresql` já usa e documenta pro mesmo motivo.

Ansible não depende de nenhuma dessas peças — não tem recurso cloud a emular. O fallback para `-i "localhost," -c local` quando o aluno não fornece inventário é o comportamento padrão pedagógico esperado (não um caso de borda a resolver).

## Arquivos exigidos por exercício

| Worker | Arquivos do aluno (`files`) | Scripts de validação (`testFiles`, sufixo `validation.sh`) |
|---|---|---|
| `TERRAFORM` | `.tf` na raiz e/ou `modules/.../main.tf` | Shell script, exit code 0 = passou. Convenção recomendada: usar a AWS CLI apontada pro Floci (`aws --endpoint-url http://localhost:4566 ... --query ... \| grep -q <esperado>`) pra checar o estado real do recurso, não só o exit code do `terraform apply`. **Sempre passar `--endpoint-url` explícito** — a variável de ambiente `AWS_ENDPOINT_URL` só é respeitada a partir do AWS CLI v2.13, e a versão instalada via `apt` no Debian (base da imagem) é mais antiga; sem a flag, o comando bate na AWS real e falha com `AuthFailure` |
| `ANSIBLE` | playbook (`.yml`/`.yaml`) + inventário opcional (`hosts.ini`) | Shell script, exit code 0 = passou. Checar o efeito real do playbook (pacote instalado, processo rodando, conteúdo de arquivo), não só o exit code do `ansible-playbook` |

Isso é igual ao contrato de arquivos que o restante do EEVEE já usa (`files`/`testFiles` escritos pelo bootstrap init container em `/app/src`/`/app/test`), sem convenção nova.

## Frontend — escopo da primeira versão

A interface de referência (mockup de design) prevê duas abas, "Recursos" e "Editor", com terminal interativo e status "ao vivo" por recurso durante a execução. Para o primeiro lançamento, isso foi conscientemente reduzido — e, na prática, **não exigiu nenhum componente novo**: o fluxo de workspace (`front/src/app/assignment/[id]/workspace/`) já é genérico por `WorkerType`, então TERRAFORM e ANSIBLE funcionam na UI só por estarem no enum e nos mapas de conteúdo padrão (confirmado lendo o código, não só supondo):

- **Editor**: árvore de arquivos e editor de código já são genéricos, reaproveitados como estão.
- **Output/"Recursos"**: o diálogo de pré-visualização (`workspace-run-preview-dialog.tsx`) já mostra `passes`/`fails`/`report` de forma genérica para qualquer worker — o `<ScrollArea>` com o "Relatório" (stdout/stderr da execução) já é exatamente o visualizador de output somente leitura que esta primeira versão precisa. Não há status "ao vivo" por recurso durante a execução — o modelo de execução do EEVEE hoje é "submete, espera, chega um resultado", não streaming por recurso — mas isso já era assim para todo worker, não é uma lacuna nova do GLACEON.
- O preflight do frontend (`workspace-preflight.utils.ts`) deriva `SUPPORTED_WORKERS` de `Object.values(WorkerType)` e só valida estrutura de arquivo para os workers Node/Python — TERRAFORM/ANSIBLE passam no preflight sem precisar de um caso novo no switch.
- Realce de sintaxe do Terraform no Monaco fica em `plaintext` por ora (sem gramática HCL pronta); Ansible usa `yaml`, já suportado.

Um terminal interativo de verdade, ou status ao vivo por recurso, exigiria exec via WebSocket contra o Kubernetes ou streaming de execução — infraestrutura sem precedente no projeto. Fica como evolução futura, não bloqueia esta primeira versão.

## Checklist de implementação (worker novo)

Segue `docs/contributing.md` § "Adicionar um executor", aplicado duas vezes (TERRAFORM e ANSIBLE). Estado em 2026-11-06:

1. ✅ Enum em `assignment-runner/src/worker/enum/worker-type.enum.ts` e `platform-api/src/worker/enum/worker-type.enum.ts`.
2. ✅ Strategy em `assignment-runner/src/worker/strategies/` + registro em `worker.service.ts`.
3. ✅ Imagem em `images/<nome>-default/` — build e smoke test via `docker run` direto confirmados (ver seção acima).
4. ✅ Migration do enum Postgres em `platform-api/src/migrations/` (`1791700000000-AddTerraformAndAnsibleWorkerTypes.ts`) + `worker-payload-builder.service.ts` (mapa de `srcPath`/`testPath` que o checklist do `contributing.md` não cita, mas o `tsc` pegou como `Record<WorkerType, ...>` faltando).
5. ✅ Espelhado no frontend: `front/src/app/interface/scheduler-api/worker.ts`, `front/src/app/admin/assignments/constants.ts` (exibição, template padrão e script de validação padrão — com o exercício real de EC2+nginx), `front/src/app/admin/templates/constants.ts`, `front/src/lib/monaco/worker-editor-config.ts`. Nenhum componente de UI novo precisou ser escrito — ver seção "Frontend" abaixo.
6. ✅ `images/Makefile` e `infrastructure/helm/eevee/values.yaml` + `templates/_helpers.tpl` atualizados.
7. ✅ Build e load das duas imagens num minikube real (`eevee-worker-bootstrap`, `worker-terraform-default-img`, `worker-ansible-default-img`), com `K8S_JOB_IMAGE_PULL_POLICY=IfNotPresent` localmente (produção usa registry real com `Always`, então isso é só ajuste de ambiente local, não mudança de código).
8. ✅ Testado dentro do cluster real: criação de turma/template/assignment e submissão como aluno pela API da Platform API (equivalente ao que a UI de admin produz), para os dois workers, caso certo e caso errado de propósito em cada um — os quatro resultados (`passes`/`fails`) chegaram corretos até o aluno via o mesmo endpoint que o frontend usa. Foi nesse teste que o bug do `ENTRYPOINT` (caixa acima) apareceu e foi corrigido. Cancelamento (`DELETE` do Job em andamento) ainda não foi exercitado nesta rodada.
9. ✅ Documentar arquivos exigidos, framework de teste, rede e credenciais (esta página).
