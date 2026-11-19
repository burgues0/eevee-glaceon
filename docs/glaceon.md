# GLACEON — módulo de laboratórios de Terraform e Ansible

GLACEON é um **módulo de aprendizagem independente** do EEVEE: serviço
próprio (backend + frontend), chart Helm próprio, sem acesso ao banco do
EEVEE e sem TypeORM. Fala com o EEVEE só pela *Learning Module Integration
API* (`platform-api`, `/api/v1/module-integration/v1`), autenticado por
sessão própria (cookie `eevee_module_glaceon`) + credencial de carga de
trabalho. Este é o padrão definido por
[`docs/guia-migracao-modulos-internos-sql-arquitetura.md`](guia-migracao-modulos-internos-sql-arquitetura.md),
que o orientador confirmou valer pra todo módulo futuro do EEVEE, não só
GLACEON.

!!! info "Origem e histórico"
    GLACEON nasceu como extensão nativa do EEVEE (dois `WorkerType` dentro do
    Strategy pattern do `assignment-runner`, usando o banco do próprio
    EEVEE). Foi migrado pra arquitetura de módulo independente depois que o
    orientador declarou o guia acima como padrão oficial. O registro de
    decisões do ponto de vista da pesquisa (justificativas, alternativas
    descartadas, ligação com a monografia) fica em `docs/decisoes-tecnicas.md`
    do repositório da monografia — inclui o pivot de arquitetura e as 2
    pendências externas descritas abaixo. Esta página é a referência de
    implementação.

## Arquitetura

```
modules/glaceon/
  backend/   # NestJS, porta 3020. Sem TypeORM, sem PG_*, sem acesso ao
             # banco do EEVEE. Fala com a Integration API, dispara Job K8s,
             # faz parsing do resultado, envia o attempt.
  frontend/  # Next.js próprio, porta 3021. Sessão eevee_module_glaceon,
             # fala só com o backend do módulo (nunca com a platform-api
             # diretamente, nunca com banco).
```

O gateway nginx (`infrastructure/helm/eevee/templates/_helpers.tpl`, helper
`eevee.entrypointNginxConf`) expõe os dois sob um único domínio público:

- `/modules/glaceon/api/*` → `glaceon-backend-service`
- `/modules/glaceon/*` (resto) → `glaceon-frontend-service`

A rota `api/` é mais específica, então o nginx sempre prefere ela
independente da ordem de declaração — nenhuma chamada de API cai pro
frontend por engano.

### Por que backend separado, não só frontend

O guia exige que o módulo nunca acesse o banco do EEVEE nem dependa de
código interno do `assignment-runner`. Como GLACEON precisa disparar Jobs
Kubernetes (mesma mecânica de execução que todo exercício do EEVEE usa) e
fazer parsing de log antes de mandar a nota, esse trabalho não pode viver no
`front/` nativo nem ser delegado à `platform-api` (que não sabe nada sobre
Terraform/Ansible). Por isso o módulo tem seu próprio backend NestJS, que
porta — copia, não importa — a orquestração de Job e o parsing de recursos
do `assignment-runner`.

## Sessão e autenticação

1. Aluno loga no EEVEE normalmente (JWT de sessão do EEVEE, `JwtAuthGuard`).
2. O frontend do módulo chama `GET /api/v1/platform/modules/glaceon/session`
   (`platform-api/src/learning-module/learning-module-session.controller.ts`)
   — reusa o `JwtAuthGuard` existente, emite um JWT curto (TTL configurável,
   300s em dev) como cookie HttpOnly `eevee_module_glaceon`, escopado a
   `path: /modules/glaceon/`. Chamar de novo renova (novo token, novo `exp`).
3. Toda chamada do frontend do módulo pro backend do módulo
   (`modules/glaceon/frontend/src/lib/glaceon-api.ts`) manda esse cookie
   (`credentials: 'include'`). O backend do módulo lê o cookie
   (`glaceon-session.util.ts`) e usa o próprio token como asserção de
   usuário ao chamar a Integration API.
4. Toda chamada do backend do módulo pra Integration API
   (`modules/glaceon/backend/src/integration-client/learning-module-client.ts`)
   manda 3 headers: `X-EEVEE-Module-Credential` (segredo compartilhado,
   `GLACEON_MODULE_CREDENTIAL`/`LEARNING_MODULE_CREDENTIAL_GLACEON` no
   Helm), `X-EEVEE-Module-Assertion` (o JWT do passo 2) e
   `X-EEVEE-Learning-Module: glaceon`. `ModuleCredentialGuard`
   (`platform-api/src/learning-module/guards/module-credential.guard.ts`)
   valida os 3 e popula o CLS "user" da request com o usuário resolvido —
   o resto da `platform-api` (`ClassAccessService`, `AttemptService`, ...)
   trata esse usuário normalmente, sem saber que um módulo está envolvido.

## Catálogo e conteúdo

Nova entidade `learning_module_activity` (`platform-api/src/learning-module/`):
`externalActivityId` (uuid), `moduleId`, `status`
(`draft`/`published`/`retired`), `kind` (`practice`/`quiz`), `title`,
`revision`, e uma referência pro `Assignment` nativo
(`assignmentId`) que já existia — é de lá que vêm `boilerplateContent`,
descrição, datas e os scripts de validação (`testFiles`, o gabarito).

A `LearningModuleIntegrationController` (`/module-integration/v1`) expõe
exatamente os 3 endpoints documentados pelo guia:

- `GET /catalog` — filtra por `moduleId` + turma do usuário (igual pro
  professor dono da turma; admin vê tudo). Só mostra `status: published`.
- `GET /activities/:externalActivityId/context` — devolve conteúdo
  autorizado (`boilerplateContent`, `testFiles`, variante). Verifica acesso
  por turma (`ClassAccessService.assertAssignmentAccess`) e nunca expõe uma
  atividade `retired`, nem uma `draft` pra quem não é professor/admin — ver
  nota de bug corrigido abaixo.
- `POST /activities/:externalActivityId/attempts` — valida
  `Idempotency-Key` (reenviar a mesma chave devolve o attempt já gravado, não
  cria um novo), persiste resultado.

Os 2 exercícios de referência (EC2+Terraform, nginx+Ansible) continuam
sendo `Assignment`s nativos por trás da cortina — não foram duplicados numa
tabela nova. O `Assignment` nativo ganhou uma coluna `archived` (migration
`1794000000000-ArchiveNativeGlaceonAssignments`) marcada `true` pros 2
registros: eles saem da listagem/detalhe nativos (aluno não vê mais o
exercício "flutuando" dentro do EEVEE clássico), mas o histórico de notas
(`Attempt`) e o próprio registro continuam intactos, porque a Integration
API lê por id direto, sem passar pelo filtro `archived`.

## Nota real via execução remota (pendência registrada)

O guia só documenta `POST /activities/:id/attempts` para questionários
(`kind: 'quiz'`) de módulos tipo `architecture-forms`. GLACEON precisa dar
nota por **execução remota** (Job roda, script de validação decide
passou/falhou), o que não tinha formato descrito. A extensão adotada:

```ts
// SubmitPracticeAttemptPayload
{
  kind: 'practice',
  score: number,
  passes: number,
  fails: number,
  report: string,
  resources?: unknown[],
}
```

em vez do formato fixo de resposta de questionário. **Isso é uma extensão
proposta, implementada para viabilizar o teste ponta a ponta, mas pendente
de validação formal com o orientador** — é o tipo de decisão que define o
padrão pra todo módulo de prática futuro, não só GLACEON. Sinalizado também
no commit que introduziu (Fase 0).

## Pacote `@cocsi-mg/eevee-learning-module-contracts` (pendência registrada)

O guia espera que o módulo instale esse pacote (GitHub Packages, org
COCSI-MG) para o cliente/tipos da Integration API. Esta sessão não tinha
credencial `read:packages` configurada, então
`learning-module-client.ts` é um **stub local** que reproduz exatamente a
assinatura documentada (`createLearningModuleClient`, mesmos tipos de
catálogo/contexto/attempt). Trocar pelo pacote real depois é mecânico: mesmo
nome de função, mesmos métodos, mesmo formato de chamada — só a origem do
import muda.

## Execução — imagens e emulação de recursos cloud

As imagens de worker (`images/terraform-default/`, `images/ansible-default/`)
e a lógica de disparo de Job não mudaram de conteúdo na migração — só mudou
**quem** cria o Job Kubernetes (antes `assignment-runner` via Strategy
pattern nativo, agora o backend do módulo via um
`KubernetesService` próprio, portado/reduzido do `assignment-runner`, sem
configMaps/secret volumes/seedSql que o módulo não usa).

### Emulação AWS (Terraform)

Exercícios de Terraform não podem bater contra uma conta AWS real (sem
custo, sem credencial do aluno). A solução é o
[Floci](https://github.com/floci-io/floci), um emulador local de API AWS,
**embutido na própria imagem do worker** — sem container sidecar (o
`KubernetesJobOptions`, nativo ou do módulo, não tem conceito de segundo
container no Job; GLACEON segue o mesmo padrão que
`PostgresqlContainerStrategy` já usava pro Postgres).

1. `images/terraform-default/Dockerfile`: multi-stage, extrai o binário
   nativo do Floci (linkado contra glibc — por isso a imagem é
   `debian:bookworm-slim`, não Alpine/musl como as outras do EEVEE).
   Terraform vem direto da HashiCorp, AWS CLI do pacote `awscli` do Debian.
2. `eevee-terraform-entrypoint` sobe o Floci em background, espera
   `GET /_floci/init` responder `"ready":true`, só então executa o comando
   real (`exec "$@"`).
3. O bloco de provider (`skip_credentials_validation`, endpoint fixo
   `http://localhost:4566`, credenciais fake) é boilerplate visível ao
   aluno, não um arquivo injetado escondido.
4. Scripts de validação via AWS CLI direta precisam de `--endpoint-url`
   explícito (a flag `AWS_ENDPOINT_URL` só é respeitada a partir do AWS CLI
   v2.13; a versão do Debian é mais antiga).

!!! warning "Kubernetes `command` sobrescreve `ENTRYPOINT`"
    O campo `command` do container Kubernetes **sobrescreve** o
    `ENTRYPOINT` da imagem (diferente de `args`, que só sobrescreve `CMD`).
    O `executionCommand` do Terraform precisa ser
    `['/usr/local/bin/eevee-terraform-entrypoint', '/app/trigger.sh']`, nunca
    só `['/app/trigger.sh']` — senão o Floci nunca sobe e `terraform apply`
    bate em `connection refused`. Preservado no port pro backend do módulo
    (`modules/glaceon/backend/src/glaceon/glaceon.config.ts`).

Ansible não depende de nada disso — não tem recurso cloud a emular.

### Arquivos exigidos por exercício

| Variante | Arquivos do aluno | Scripts de validação (`testFiles`) |
|---|---|---|
| `terraform` | `.tf` na raiz | Shell script, exit 0 = passou. Checar o estado real via AWS CLI apontada pro Floci, não só o exit code do `apply` |
| `ansible` | playbook `.yml`/`.yaml` | Shell script, exit 0 = passou. Checar o efeito real do playbook, não só o exit code |

### Como o status por recurso chega no frontend

`trigger.sh` imprime, além do bloco `EEVEE_TEST_OUTPUT_START/END` genérico,
um segundo bloco `EEVEE_RESOURCES_JSON_START/END` com uma lista plana de
"fatos" (`{id, category, type, status, attributes, relatedResources, logs}`),
montada via `jq`:

- **Terraform**: `terraform show -json` dá a configuração declarada
  (`attributes`/`relatedResources`); os eventos NDJSON do `apply -json` dão
  o `status` por recurso (um recurso nunca alcançado fica `pending`).
- **Ansible**: callback plugin próprio
  (`images/ansible-default/callback_plugins/glaceon_json.py`, porque
  `ansible-core` atual não traz mais o callback `json` embutido) dá um JSON
  por play/task/host.

`resource-parsers.ts` no backend do módulo (porte de
`worker-resource-parsers.ts`, que foi removido do `assignment-runner` na
Fase 3 de descomissionamento) extrai esse bloco e agrupa por categoria — não
sabe nada de Terraform/Ansible especificamente, os dois alimentam o mesmo
formato plano.

**Limitação conhecida**: se o `terraform plan` falhar completamente (HCL
inválido), não há `configuration` pra ler e a árvore de recursos fica vazia
— o erro real ainda aparece no relatório. Resolver isso exigiria um parser
HCL próprio; não foi feito.

## Frontend do módulo — escopo

Workspace de arquivo único (GLACEON nunca editou múltiplos arquivos ao mesmo
tempo): editor Monaco puro (`@monaco-editor/react`, tema `vs-dark` embutido),
painel de recursos portado quase verbatim do componente nativo
(`workspace-resources-panel.tsx`), paleta Glaceon
(`#94e6ee`/`#415a6a`/`#7b9cb4`) como tema **base** da própria aplicação — não
uma classe de escopo como `.glaceon-theme` era no `front/` nativo, porque
agora o app inteiro É o módulo.

Deliberadamente **não** portado do workspace nativo: workspace Monaco
multi-arquivo, guarda de paste/drag, motor de tema via CSS custom properties
dinâmico. Nenhum requisito documentado de anticheat ou múltiplos arquivos
existe pra GLACEON especificamente; se isso mudar, o ponto de entrada é
`modules/glaceon/frontend/src/components/glaceon/activity-editor.tsx`.

## Descomissionamento do caminho nativo

Removido por completo (commit da Fase 3): `WorkerType.TERRAFORM`/`ANSIBLE`
dos 3 enums (`platform-api`, `assignment-runner`, `front`), as duas
strategies e o parser de recursos do `assignment-runner`, as entradas de
UI nativa (`admin/assignments/constants.ts`, `admin/templates/constants.ts`,
`worker-editor-config.ts`), a aba "Recursos" do workspace nativo e seu
componente. Os 2 `Assignment`s de referência foram arquivados (seção
"Catálogo e conteúdo" acima), não apagados.

## Testes de aceite (guia, Fase 4)

Checklist rodado literalmente contra o stack local (minikube + dev
processes) em 2026-11-19:

| Item do guia | Resultado |
|---|---|
| Login EEVEE, emissão e renovação do cookie do módulo | ✅ Chamadas consecutivas a `/session` emitem tokens diferentes com `exp` renovado |
| Catálogo vazio pra usuário sem atividades acessíveis | ✅ Usuário sem matrícula em nenhuma turma recebe `[]` |
| Negação pra usuário fora da turma | ✅ — **bug encontrado e corrigido**: retornava 500 (erro genérico do client stub não traduzido), não uma negação limpa. Ver `LearningModuleClientExceptionFilter` |
| Negação pra credencial de outro módulo | ✅ 401 `Invalid module credentials.` |
| Ocultação de atividade não publicada | ✅ — **bug encontrado e corrigido**: `draft` só era filtrado no catálogo; acesso direto por `externalActivityId` ainda devolvia o conteúdo completo pra um aluno matriculado. `findAccessibleActivity` agora nega como "unknown" pra estudante |
| Ocultação de gabarito antes da liberação | ✅ `testFiles` nunca é repassado pelo backend do módulo ao seu próprio frontend (verificado por inspeção + chamada real) |
| Rejeição de `externalActivityId` desconhecido/retirado | ✅ 404 nos dois casos |
| Idempotência de reenvio de tentativa (`Idempotency-Key`) | ✅ Reenvio com a mesma chave e payload diferente devolve o attempt já gravado, sem criar um novo |
| Ausência de segredos no bundle do frontend e nos logs | ✅ `GLACEON_MODULE_CREDENTIAL` não aparece no `.next` buildado nem nos logs do backend (grep vazio nos dois) |
| Build | ✅ `tsc`/`jest`/`next build`/`docker build` limpos nos dois serviços do módulo e na `platform-api` |
| Testes de contrato consumidor/provedor | ❌ **Não implementado.** Não há verificação automatizada de que o stub do client bate com o shape real da Integration API além dos tipos TypeScript compartilhados manualmente — um teste de contrato (Pact ou equivalente) ficou de fora por escopo/tempo de TCC. Risco real se o pacote oficial divergir do stub |
| Health check | ✅ `GET /health` adicionado ao backend do módulo (fora do prefixo `/api`), confirmado 200 |
| Smoke test da rota pública | ✅ Confirmado com um nginx real (não só o Helm `template`) replicando as 2 rotas do gateway contra o backend/frontend do módulo rodando: prefixo é removido corretamente, `/modules/glaceon/api/*` chega no backend, `/modules/glaceon/*` chega no frontend |

Os dois bugs encontrados nesta checklist foram corrigidos na mesma sessão
(ver commit "fix: close two acceptance-test gaps..." na branch
`feature/glaceon-workers`) — a suíte completa da `platform-api` (467/467) e
do backend do módulo seguem passando depois da correção.
