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

1. `images/terraform-default/Dockerfile` usa build multi-stage: extrai o binário `floci-aws` da imagem oficial `floci/floci:latest` (sem precisar montar `/var/run/docker.sock`, já que os exercícios não dependem de serviços que exigem container real, como Lambda).
2. `eevee-terraform-entrypoint` inicia o Floci em background, espera responder (retry de uma chamada AWS CLI benigna, como `aws sts get-caller-identity`, em vez de depender de um endpoint de health específico), e só então executa o comando real (`exec "$@"`).
3. O bloco de provider do Terraform (`skip_credentials_validation`, `skip_requesting_account_id`, `skip_metadata_api_check = true`, região fixa, credenciais fake) faz parte do **boilerplate padrão do exercício** mostrado ao aluno (`WORKER_DEFAULT_TEMPLATE_CONTENT_MAP[WorkerType.TERRAFORM]` no frontend) — não é um arquivo injetado escondido. O aluno vê e lê essa configuração.
4. Cleanup: nenhum código novo. O TTL/deadline do Job (`ttlSecondsAfterFinished`/`activeDeadlineSeconds`, mesmos campos que `PostgresqlContainerStrategy` já usa) encerra o container, e o Floci junto com ele.

Ansible não depende de nenhuma dessas peças — não tem recurso cloud a emular. O fallback para `-i "localhost," -c local` quando o aluno não fornece inventário é o comportamento padrão pedagógico esperado (não um caso de borda a resolver).

## Arquivos exigidos por exercício

| Worker | Arquivos do aluno (`files`) | Scripts de validação (`testFiles`, sufixo `validation.sh`) |
|---|---|---|
| `TERRAFORM` | `.tf` na raiz e/ou `modules/.../main.tf` | Shell script, exit code 0 = passou. Convenção recomendada: usar a AWS CLI apontada pro Floci (`aws ... --query ... \| grep -q <esperado>`) pra checar o estado real do recurso, não só o exit code do `terraform apply` |
| `ANSIBLE` | playbook (`.yml`/`.yaml`) + inventário opcional (`hosts.ini`) | Shell script, exit code 0 = passou. Checar o efeito real do playbook (pacote instalado, processo rodando, conteúdo de arquivo), não só o exit code do `ansible-playbook` |

Isso é igual ao contrato de arquivos que o restante do EEVEE já usa (`files`/`testFiles` escritos pelo bootstrap init container em `/app/src`/`/app/test`), sem convenção nova.

## Frontend — escopo da primeira versão

A interface de referência (mockup de design) prevê duas abas, "Recursos" e "Editor", com terminal interativo e status "ao vivo" por recurso durante a execução. Para o primeiro lançamento, isso foi conscientemente reduzido:

- **Editor**: árvore de arquivos e editor de código reaproveitados de `front/src/app/assignment/[id]/workspace/` (já genéricos, não específicos de uma linguagem). O painel que no mockup é um terminal interativo vira, nesta versão, um visualizador de output somente leitura (stdout/stderr da última tentativa).
- **Recursos**: árvore de recursos/playbooks com status final (passou/falhou), não progresso ao vivo durante a execução — o modelo de execução do EEVEE hoje é "submete, espera, chega um resultado", não streaming por recurso.
- Realce de sintaxe do Terraform no Monaco fica em `plaintext` por ora (sem gramática HCL pronta); Ansible usa `yaml`, já suportado.

Um terminal interativo de verdade exigiria exec via WebSocket contra o Kubernetes, infraestrutura sem precedente no projeto — fica como evolução futura, não bloqueia esta primeira versão.

## Checklist de implementação (worker novo)

Segue `docs/contributing.md` § "Adicionar um executor", aplicado duas vezes (TERRAFORM e ANSIBLE):

1. Enum em `assignment-runner/src/worker/enum/worker-type.enum.ts` e `platform-api/src/worker/enum/worker-type.enum.ts`.
2. Strategy em `assignment-runner/src/worker/strategies/` + registro em `worker.service.ts`.
3. Imagem em `images/<nome>-default/`.
4. Migration do enum Postgres em `platform-api/src/migrations/`.
5. Espelhar no frontend: `front/src/app/interface/scheduler-api/worker.ts`, `front/src/app/admin/assignments/constants.ts` (exibição, template padrão, script de validação padrão), `front/src/app/admin/templates/constants.ts`, `front/src/lib/monaco/worker-editor-config.ts`.
6. Atualizar `images/Makefile` e, se aplicável, `infrastructure/helm/eevee/values.yaml` + `templates/_helpers.tpl`.
7. Build e load da imagem na cluster (`make -C images build-<nome>-default load-<nome>-default`).
8. Testar template, preview, submissão, cancelamento e parsing do resultado.
9. Documentar arquivos exigidos, framework de teste, rede e credenciais (esta página).
