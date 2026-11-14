> Cópia do ADR original do TRAMA, publicada como amostra do processo de decisão. Caminhos de arquivo, changes OpenSpec e IDs de achado (`ACH-…`) referem-se ao repositório privado.

# ADR-048: Política de Acesso por Recurso com Predicado Único

**Status:** vigente

**Data:** 2026-11-09
**Relaciona-se com:** `openspec/changes/archive/2026-11-11-centralizar-politica-de-acesso-por-recurso/`,
`openspec/specs/politica-acesso-recursos/`, `openspec/specs/documentos/`,
`openspec/specs/processos/`, ADR-044, ADR-047

## Contexto

A decisão "este ator pode fazer esta ação sobre este documento ou processo" não
tinha dono. A leitura de documento existia em quatro cópias: o filtro SQL da
listagem (`applyAccessFilter`), a checagem em TypeScript para outro usuário
(`userHasAccess`), o filtro próprio do adapter de busca e a checagem dos autos
do processo (`hasAccessToDocument`). A leitura de processo existia em duas
(`canAccessProcess` e `processAccessCondition`), declaradas "a mesma regra". O
código pedia que as cópias concordassem, e nada o garantia.

As fontes de acesso também não tinham catálogo. Somavam-se ACL, autoria,
editor, cópia, termo de arquivamento, cinco origens de concessão e três
permissões, e nenhum lugar dizia o que cada uma concede e quando deixa de
valer. Os furos de acesso dos recortes 1a–1d e das etapas 2 e 4 da Fase E
foram achados rota a rota por causa disso, e vários nasceram de uma fonte nova
que não foi propagada a todas as cópias.

## Decisão

1. **Catálogo de fontes por domínio.** Cada domínio declara as próprias fontes
   de acesso num único arquivo: `documents/access/document-access-sources.ts`
   e `workflows/access/process-access-sources.ts`. Cada fonte é um objeto
   imutável com `id` estável, as ações que concede, o alcance (no documento:
   `full` ou `act`, conforme ADR-044), o portão de permissão, o fragmento SQL
   e o texto de vigência. O vocabulário comum (`SqlCondition`, `AccessSource`,
   `AccessActor`, composição do predicado) fica em
   `apps/api/src/shared/access-policy/`. Não há módulo de domínio novo.
2. **Predicado único para lista, ID e ator-alvo.** A listagem aplica o `OR`
   dos fragmentos das fontes que concedem a ação. A checagem por ID roda os
   mesmos fragmentos, um por `CASE`, e devolve as fontes que casaram. A
   decisão para outro usuário é a mesma consulta, com o ator montado a partir
   do perfil e dos setores dele. Não existe cópia da regra em TypeScript.
3. **Ator explícito.** A fonte nunca lê o contexto da requisição. Recebe um
   `AccessActor` (`tenantId`, `userId`, permissões, slug do perfil, setores),
   montado para o usuário corrente ou para um usuário-alvo.
4. **Motivo interno à decisão.** A decisão devolve permitido ou negado, o
   motivo (as fontes que casaram) e, no documento, o alcance. O motivo serve à
   auditoria, aos testes e à matriz da etapa 6. Não é devolvido em resposta
   HTTP, por minimização.
5. **Fonte nova só entra com caso de paridade.** Um teste cria, para cada fonte
   e cada ação que ela concede, uma fixture em que só aquela fonte liga o ator
   ao recurso, e confere que lista, ID e ator-alvo concordam e que o motivo
   nomeia a fonte. Uma parte do teste roda sem banco e reprova fonte do
   catálogo sem caso.
6. **Recomputação local reprovada por teste-guarda.** Leitura de
   `document_access_grants`, operadores de ACL sobre as colunas `allowed_*` de
   documento e de processo, e leitura das tabelas de vínculo de processo para
   decidir acesso, fora dos arquivos das políticas, reprovam o teste. As
   exceções ficam numa lista nominal, com motivo, que só diminui. Escrita de
   concessão fica restrita aos escritores nomeados.

## Alternativas descartadas

- **Decisão em TypeScript e teste de paridade com o filtro SQL.** Manteria
  duas implementações por fonte, que é a classe de defeito que esta decisão
  ataca. O teste reduziria a divergência, mas não a eliminaria.
- **Módulo de domínio `access` separado.** Concentraria regras de documento e
  de processo num terceiro dono e criaria dependência cruzada. O dono da regra
  continua sendo o domínio do recurso.
- **Motivo na resposta HTTP.** Exporia a estrutura de acesso de terceiros (ACL,
  concessões) sem necessidade do usuário final.

## Consequências

- Os métodos públicos atuais (`findById`, `assertCanAccess`, `canWrite`,
  `resolveVersionReach`, `canAccessProcess` e afins) continuam existindo como
  camadas finas sobre a política, para não espalhar a mudança pelos chamadores.
- A busca e `GET /documents` passam a depender do predicado gerado. A geração
  reproduz os fragmentos atuais, sobre os mesmos índices, e a comparação de
  `EXPLAIN ANALYZE` antes e depois fica registrada na change.
- A matriz `perfil × vínculo × ação × estado` da etapa 6 consome a decisão e o
  motivo, em vez de reler regra por rota.
- Ações de etapa (`submitAction`) não passam pela política nesta decisão; ficam
  para as etapas 6 e 7 da Fase E.
- Os efeitos de comportamento que a adoção corrige (concessão por fonte, fim de
  vigência das fontes operacionais de processo, cascata de revogação de
  comunicação, concessão só de leitura para a fila) são decisões da change e
  das specs, não deste ADR.
