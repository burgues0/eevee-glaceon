# Manual de integração: módulos SQL e Arquitetura/Formulários

Este manual explica como uma equipe integra um módulo de aprendizagem ao EEVEE.
O EEVEE é o shell, a fonte de identidade e a autoridade de acesso; o módulo é
um serviço independente, acessado por rota própria e integrado somente por APIs
e bibliotecas versionadas.

## Regra de integração

O módulo **não** acessa banco de dados EEVEE, não recebe credenciais `PG_*`,
não usa entidades TypeORM e não faz consultas para descobrir conteúdo, turma,
usuário ou tentativas. A Platform API fornece todo contexto autorizado pelo
Learning Module Integration API.

```text
Navegador ── sessão EEVEE ──► Shell /modules/<id>/ ──► módulo
                                                          │
                   credencial de serviço + asserção curta │
                                                          ▼
                                  /api/v1/module-integration/v1
                                                          │
                                                          ▼
                                                Platform API EEVEE
                                                          │
                                                          ▼
                                                dados internos EEVEE
```

O módulo vê somente referências opacas de atividades e dados filtrados para o
usuário atual. O EEVEE pode alterar seu esquema interno sem alterar o contrato
do módulo.

## Módulos e rotas

| Módulo | Rota | Conteúdo atendido |
| --- | --- | --- |
| `sql-practice` | `/modules/sql-practice/` | práticas de SQL e manipulação de dados |
| `architecture-forms` | `/modules/architecture-forms/` | prática de Arquitetura, conversões e questionários atribuídos ao módulo |

Cada módulo possui frontend, backend, chart Helm, health check, manifesto e
segredos próprios. O shell anuncia um módulo somente quando a respectiva rota
e a sessão estão habilitadas.

## O que o EEVEE entrega à equipe do módulo

1. Uma rota pública sob `/modules/<id>/` e a configuração de gateway para o
   frontend/API do módulo.
2. Uma chave de sessão exclusiva do módulo, usada para validar a sessão curta
   do usuário. Ela nunca é compartilhada com outro módulo.
3. Uma credencial opaca de carga de trabalho exclusiva do backend do módulo,
   com audiência e permissões restritas ao módulo.
4. O pacote `@cocsi-mg/eevee-learning-module-contracts`, que contém tipos e
   cliente HTTP do contrato.
5. Entradas de catálogo atribuídas ao módulo. Cada atividade é identificada
   por `externalActivityId` UUID; esse valor é o único identificador que o
   módulo usa para conteúdo.

As chaves são entregues ao backend por identidade de workload ou referência a
Secret no Kubernetes. Elas não entram no frontend, em logs, em commits,
`VITE_*` ou `NEXT_PUBLIC_*`.

## Autenticação e autorização

Há duas credenciais com funções diferentes:

| Credencial | Local | Finalidade |
| --- | --- | --- |
| `eevee_module_<id>` | navegador e backend do próprio módulo | representa o usuário no módulo; é HttpOnly, curta e limitada à rota do módulo |
| credencial de carga | somente backend do módulo | autentica o serviço perante a Integration API |

Fluxo:

1. O usuário faz login pelo EEVEE.
2. O frontend do módulo solicita `GET /api/v1/platform/modules/<id>/session`.
3. O EEVEE grava o cookie `eevee_module_<id>` em `/modules/<id>/`.
4. O navegador chama a API do módulo; o cookie é enviado automaticamente ao
   backend do módulo, sem ficar acessível ao JavaScript.
5. O backend valida a sessão e chama a Integration API com a credencial de
   carga e a asserção curta do usuário.
6. A Platform API valida módulo, credencial, usuário, papel, matrícula,
   publicação, datas e regras da atividade antes de responder.

Não confie em `userId`, `classId`, papel, nota ou identificador de atividade
enviado pelo navegador. O backend sempre usa a sessão validada e o
`externalActivityId` recebido do catálogo.

## Biblioteca de integração

Instale a versão aprovada de `@cocsi-mg/eevee-learning-module-contracts` no
**backend** do módulo. O cliente envia os cabeçalhos exigidos e oferece os
tipos da API.

```ts
import {
  createLearningModuleClient,
} from '@cocsi-mg/eevee-learning-module-contracts';

const integration = createLearningModuleClient({
  endpoint: process.env.EEVEE_LEARNING_INTEGRATION_URL!,
  moduleId: 'sql-practice',
  credential: process.env.EEVEE_MODULE_SERVICE_CREDENTIAL!,
});

// `userAssertion` vem da sessão HttpOnly já validada pelo backend do módulo.
const catalog = await integration.listCatalog(userAssertion);
const context = await integration.getContext(
  catalog[0].externalActivityId,
  userAssertion,
);
```

Para um endpoint HTTPS público, use a URL HTTPS normalmente. Em uma chamada
interna do cluster, o cliente aceita um endereço `.svc` por HTTP apenas com
`allowInsecureHttpForCluster: true`; use essa opção somente na malha/rede de
serviço aprovada pelo EEVEE.

## API de integração v1

A URL base é `/api/v1/module-integration/v1`.

| Operação | Método e rota | Uso |
| --- | --- | --- |
| Catálogo do usuário | `GET /catalog` | devolve atividades atribuídas e visíveis para o usuário autenticado |
| Contexto de atividade | `GET /activities/{externalActivityId}/context` | devolve conteúdo autorizado, datas e política da atividade |
| Envio de questionário | `POST /activities/{externalActivityId}/attempts` | registra respostas respeitando prazo, tentativas e feedback |

O cliente envia automaticamente:

```text
X-EEVEE-Module-Credential: <credencial do backend>
X-EEVEE-Module-Assertion: <asserção curta do usuário>
X-EEVEE-Learning-Module: <id do módulo>
```

O envio de tentativa também exige um `Idempotency-Key` de 16 a 128 caracteres
seguros. Reutilize a mesma chave ao repetir uma requisição cuja resposta foi
perdida; o EEVEE devolve o resultado já registrado em vez de criar uma segunda
tentativa.

### Catálogo

Uma entrada de catálogo contém:

```ts
type LearningModuleCatalogEntryV1 = {
  externalActivityId: string;
  revision: number;
  status: 'draft' | 'published' | 'retired';
  kind: 'practice' | 'quiz';
  title: string;
  effectiveAt: string;
};
```

Guarde `revision` e atualize a representação local quando ela mudar. Atividades
retiradas deixam de aparecer no catálogo. O módulo não deve manter uma cópia
permanente de todo conteúdo EEVEE como substituto da API.

### Contexto

O contexto retorna título, descrição, janela de acesso, política e conteúdo
adequado ao usuário. Para questionários, o estudante recebe perguntas e
alternativas; gabarito, explicações e nota continuam ocultos até a liberação
definida pelo EEVEE. Para uma prática, o módulo recebe apenas a configuração
autorizada daquela atividade.

### Tentativas

O endpoint de tentativas é destinado a questionários de
`architecture-forms`. Ele valida a associação do estudante à turma, a abertura,
o prazo, o limite de tentativas e a liberação de feedback antes de persistir.
O resultado imediato não revela nota antes da política da atividade permitir.

## Implementação do módulo SQL

1. Use o ID `sql-practice` e a rota `/modules/sql-practice/`.
2. Busque o catálogo/contexto com o cliente oficial e renderize apenas
   atividades `kind = 'practice'` recebidas pelo contrato.
3. Preserve o laboratório local atual: banco efêmero no navegador, execução de
   `setupSql`, reinício limpo e limites de resultado/tempo.
4. Não abra conexão com o PostgreSQL EEVEE. Se a prática precisar de execução
   remota, use `@cocsi-mg/eevee-platform-runtime` e uma capacidade aprovada.
5. Não apresente `checkSql`/resultado esperado como avaliação protegida; o
   laboratório atual é uma prática guiada.

## Implementação do módulo Arquitetura/Formulários

1. Use o ID `architecture-forms` e a rota `/modules/architecture-forms/`.
2. Consuma somente atividades presentes no catálogo. O EEVEE atribui ao módulo
   a prática de Arquitetura e os questionários revisados para esse domínio.
3. Preserve as regras de conversão de base e unidades: bases 2/10/16, frações,
   limites de precisão e unidades SI/IEC.
4. Para questionários, mostre o contexto filtrado e envie respostas pelo método
   `submitAttempt` com uma chave de idempotência nova por envio lógico.
5. Leia feedback e nota apenas pelo contexto/histórico autorizado; nunca
   calcule ou mantenha gabarito no navegador.

## Integrações complementares

| Necessidade | Contrato correto |
| --- | --- |
| Principal e política no backend | `@cocsi-mg/eevee-platform-auth` |
| Arquivos e snapshots | `@cocsi-mg/eevee-file-storage` e File Storage API |
| Execução isolada | `@cocsi-mg/eevee-platform-runtime` |
| Capacidade de extensão revisada | `@cocsi-mg/eevee-platform-extensions` |
| Conteúdo, contexto e tentativas | `@cocsi-mg/eevee-learning-module-contracts` |

Essas bibliotecas definem contratos de serviço; nenhuma concede acesso direto
a banco, filesystem, PVC, contas EEVEE ou segredos de outra aplicação.

## Testes de aceite

Antes de publicar uma versão do módulo, valide:

- login EEVEE, emissão e renovação do cookie do módulo;
- catálogo vazio para usuário sem atividades acessíveis;
- negação para usuário fora da turma e para credencial de outro módulo;
- ocultação de atividade não publicada e de gabarito antes da liberação;
- rejeição de `externalActivityId` desconhecido/retirado;
- repetição de envio de questionário com a mesma `Idempotency-Key`;
- ausência de segredos no bundle do frontend e nos logs;
- build, testes de contrato consumidor/provedor, health check e smoke test da
  rota pública.

## Publicação e rollback

O EEVEE provisiona rota, sessão, credencial e catálogo antes de anunciar o
módulo. A equipe do módulo publica imagens imutáveis, aplica seu chart e valida
health check e contrato em homologação. A ativação acontece por módulo e por
conteúdo atribuído.

Para rollback, o EEVEE retira a atribuição do catálogo e desabilita a rota do
módulo. Os dados internos permanecem preservados atrás da Platform API; não há
ação de banco a executar pela equipe consumidora.
