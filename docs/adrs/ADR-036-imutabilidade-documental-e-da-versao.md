> Cópia do ADR original do TRAMA, publicada como amostra do processo de decisão. Caminhos de arquivo, changes OpenSpec e IDs de achado (`ACH-…`) referem-se ao repositório privado.

# ADR-036: Imutabilidade Documental é da Versão, Não do Documento

**Status:** vigente

> Status anterior à divisão (até 2026-10-29): Aceito

**Data:** 2026-09-08
**Relaciona-se com:** ADR-020 (assinatura A1 sem custódia, que já cria versão
nova para o PDF assinado), ADR-023 (ponte Lacuna, o provedor em que a assinatura
existe fora do TRAMA antes de a versão ser gravada),
`openspec/changes/archive/2026-07-22-separar-ciclo-vida-assinatura-documental/`
(origem da política central de imutabilidade),
`openspec/changes/tornar-imutabilidade-documental-por-versao`

## Contexto

`DocumentImmutabilityService.isImmutable` responde uma pergunta escopada ao
**documento**: existe evidência de assinatura em *qualquer* versão? Qualquer
resposta positiva bloqueava, indistintamente, alteração de metadados, exclusão
lógica, destinação/eliminação, criação de versão nova e os três caminhos de
assinatura.

O que uma assinatura protege, porém, é o **arquivo assinado**, e arquivo é
versão — não documento. A invariante que precisa valer é estreita:

> Uma versão de documento com assinatura válida nunca muda de conteúdo.

Essa invariante já era sustentada pelo modelo de armazenamento, e não pelo gate:
cada `DocumentVersion` tem `storage_key` e `sha256_hash` próprios, o protocolo de
reserva/finalização grava uma versão `ready` uma única vez, o carimbo da
assinatura simples vai para chave separada sem tocar o original, e a assinatura
A1 **cria uma versão nova** para o PDF assinado — de modo que `vN` não assinada e
`vN+1` assinada já coexistiam como estado normal do sistema.

A justificativa registrada para o escopo amplo era circular: o design de
`separar-ciclo-vida-assinatura-documental` afirmava que "qualquer versão" era
defesa em profundidade porque `addVersion` já estava bloqueado por `isImmutable`
assim que qualquer assinatura existisse — isto é, o gate se justificava pela
consequência que ele mesmo produzia. Não havia ADR sobre o tema.

O custo era concreto e observado em homologação:

- **ACH-20260905-004** — anexar nova versão ao corrigir uma comunicação
  respondia `422` em todo documento assinado por TOTP ou por plano concluído.
- A incoerência já era observável: documento assinado **apenas** por sessão A1
  aceitava versão nova (`DFD-2026-00002`, HTTP 201), porque a versão assinada
  criada pela conclusão da sessão trafega por um caminho de gravação com origem
  declarada. O sistema já praticava o modelo por versão em um dos caminhos, por
  omissão.
- **ACH-20260905-009** — a regra de produto "documento, versão e hash são
  congelados ao ativar o plano" era sustentada apenas pelo frontend:
  `reserveVersion` nunca consultou plano de assinaturas ativo. Enquanto
  `isImmutable` cobria o caso por acidente (plano ativo costuma implicar
  evidência), remover o gate amplo deixaria a regra sem proteção de backend
  alguma.

## Decisão

Imutabilidade documental passa a ter **dois escopos declarados**, e cada ponto
de controle declara qual usa.

1. **Por documento** (`isImmutable`, inalterado) — operações cujo alvo é o
   documento inteiro: alteração de metadados (`PATCH /documents/:id`), exclusão
   lógica (`DELETE /documents/:id`) e destinação/eliminação. Qualquer evidência,
   em qualquer versão, bloqueia. A razão é substantiva: alterar metadados muda o
   contexto de uma assinatura existente, e excluir ou eliminar leva a versão
   assinada junto.
2. **Por versão** (`isVersionImmutable`, novo) — operações cujo alvo é uma versão
   específica: assinar. Bloqueia apenas evidência vinculada àquela versão. Lê o
   mesmo conjunto canônico de `isImmutable` — `DocumentSignature`,
   `SignatureSession` `COMPLETED` (por `completed_document_version_id`),
   `SignaturePlanDocument` de plano `completed`, `IcpSignature` concluída — com o
   predicado de versão exata acrescentado.

**Criar uma versão nova não é bloqueado por nenhum dos dois escopos**, por não
mutar nenhuma versão existente. Os gates que restam em `addVersion` protegem
outra coisa: documento arquivado, assinatura ICP A1 em processamento para a
versão vigente, e — novo — **plano de assinaturas ativo**, que passa a existir no
backend com a mesma mensagem já usada por `archive`.

`SignatureSessionService.lockDocumentForSigning` passa a recusar documento com
plano de assinaturas ativo, gate que a assinatura simples e a criação de
solicitação já aplicavam e que o caminho de sessão nunca teve. A recusa ocorre na
preparação da sessão, **antes de qualquer chamada a provedor externo**: no
`LACUNA_BRIDGE` a assinatura é produzida e carimbada fora do TRAMA, e uma recusa
tardia descartaria evidência impossível de refazer.

A exceção nominal de coleta coordenada — signatário pendente de solicitação
pendente não é bloqueado pela evidência de outro signatário — é avaliada
**antes** do gate por versão, nos dois caminhos que a possuem. Sem isso, o
recorte por versão não resolveria a coleta coordenada, apenas mudaria o motivo da
recusa: a sessão do segundo signatário tem como alvo a versão vigente, que depois
da conclusão do primeiro é justamente a recém-assinada.

`DocumentVersionSignatureGuardService.isVersionSigned` **não** é reusado para
imutabilidade, apesar da sobreposição: os dois serviços respondem a perguntas
diferentes ("esta versão está protegida contra mutação" e "esta versão pode ser
distribuída/anexada") e já divergem no que aceitam — `isVersionSigned` não
considera `IcpSignature` legada. Unificá-los obrigaria a decidir agora se
evidência legada passa a habilitar distribuição, mudança de comportamento fora
deste escopo. A duplicação é de três `EXISTS`, com docstring cruzada.

## Consequências

**Passa a ser permitido:**

- Documento com versão assinada recebe versões novas — some o `422` do
  ACH-20260905-004.
- A versão nova, ainda não assinada, é assinável pelos três caminhos (TOTP,
  sessão A1/Lacuna, solicitação de assinatura).
- Solicitação de assinatura sobre documento cuja versão vigente não está
  assinada, mesmo havendo versão anterior assinada.

**Continua bloqueado:**

- Alteração de metadados, exclusão lógica e destinação de documento com qualquer
  evidência — inclusive quando a versão vigente não é a assinada.
- A mesma pessoa assinando duas vezes a mesma versão.
- Segunda assinatura avulsa de terceiro sobre versão já assinada, fora de plano e
  fora de solicitação pendente — a exceção é nominal, e é isso que mantém o
  bloqueio íntegro.
- Assinatura e nova versão em documento com plano de assinaturas ativo; nova
  versão em documento arquivado ou com ICP A1 em processamento.

**Risco residual assumido:** um documento assinado pode passar a ter como versão
vigente uma versão não assinada. Quem baixar "o documento" sem escolher versão
recebe a mais nova, isto é, a não assinada. É intencional e é o comportamento
correto para um documento que teve continuação. A mitigação é de interface — o
badge "Assinado" permanece (é fato) e um sinal adicional declara que a versão
vigente não está assinada, a partir de `currentVersionSigned` — somada ao fato de
que todo consumidor institucional (comunicação, processo, verificação pública)
trabalha sobre versão congelada, nunca sobre "a versão vigente no momento da
leitura".

Na comunicação, até 2026-09-24 isso valia só para o **registro**: o envio fixava
`document_distributions.document_version_id`, mas o destinatário que abria o
documento a partir da comunicação lia a versão vigente (ACH-20260908-004). A
change `enxugar-respostas-e-auditar-leitura-documental` fixou também a
**leitura**: prévia, download e "Abrir documento" a partir da comunicação
entregam a versão enviada, e o card sinaliza quando existe versão mais nova —
o mesmo desenho do processo com a versão vinculada.

**Evidência continua sem revogação.** Nem `DocumentSignature` nem `IcpSignature`
possuem estado de cancelamento: uma vez concluída, a evidência é permanente para
todos os gates, mesmo que o certificado associado seja revogado depois.
`IcpSignature` permanece exclusivamente como evidência de leitura, sem escritor
no código (CLAUDE.md, "Legado (histórico, não reativar)"), e é lida por
`isVersionImmutable` pela mesma razão que por `isImmutable`. Esta decisão não
altera o ciclo de vida da evidência.

**Nota de 2026-10-19 — base da assinatura digital derivada do original** (change
`assinar-copia-carimbada-na-coleta-mista`): a sessão de assinatura digital deixa
de enviar ao provedor o original da versão quando há assinaturas simples nela ou
logo no carimbo da autoridade. A base enviada passa a ser derivada do original:
original + carimbos e Folha de Assinaturas das assinaturas simples + logo do
carimbo da autoridade, gerada na abertura, dentro da transação e do lock do
documento. Isso não muta a versão-base: nenhum byte dela é regravado, e o hash
canônico da sessão (`documentHash`) **continua sendo o hash do original**. O hash
e o tamanho da base enviada ficam à parte (`base_content_sha256`,
`base_content_length`), só para a conclusão conferir que o PDF devolvido começa
por ela. A versão nova gravada pela conclusão é a base + a assinatura PAdES por
revisão incremental. Na mesma change, assinatura simples sobre versão com sessão
de assinatura digital concluída passa a ser recusada em todos os caminhos,
inclusive pela exceção nominal: desenhar carimbo e Folha depois do PAdES
reescreveria a versão assinada (ACH-20260906-005).

**Nota de 2026-10-20 — requisito de plano cumprido por sessão de assinatura
digital** (change `cumprir-plano-de-assinaturas-com-certificado`): substitui a
nota de estado que registrava `signature_requirement_id` sem escritor. O
participante do plano passa a ter forma de assinatura (`simple` ou
`certificate`), e o participante `certificate` abre sessão pelo próprio plano
(`SignaturePlansService.openRequirementSession`). Só esse caminho preenche
`signature_requirement_id`, nunca o cliente.

- **Exceção nominal.** A sessão do plano é a única exceção ao gate de plano ativo
  em `lockDocumentForSigning`. Ela também dispensa o gate por versão
  (`DOCUMENT_ALREADY_SIGNED`), porque a versão congelada já pode conter as
  assinaturas simples do próprio plano. O gate de solicitação pendente continua
  valendo.
- **Conclusão.** Na transação da conclusão, a sessão cumpre o requisito e
  reancora para a versão produzida o documento congelado do plano e o vínculo
  `process_documents.document_version_id`, preservando a versão de partida em
  `original_*`. O plano pode ter vários participantes `certificate`, cada um
  assinando a versão vigente, e a etapa é aprovada sobre o arquivo que o
  processo mostra.
- **Fim do plano.** A rejeição, o cancelamento e a expiração do plano cancelam as
  sessões `PREPARED` dos requisitos dele.
- **O que não muda.** A imutabilidade por versão não muda: a reancoragem aponta
  para versão nova, nenhuma versão existente é regravada.

## Alternativas descartadas

- **Manter o gate por documento e abrir exceção para o fluxo de correção de
  comunicação.** Trataria o sintoma (ACH-20260905-004) preservando a premissa
  errada, e multiplicaria exceções a cada novo fluxo que precisasse continuar um
  documento assinado.
- **Reusar `isVersionSigned` como política única de imutabilidade.** Descartado
  pelas razões acima: perguntas distintas, conjuntos de evidência distintos, e
  mudança de comportamento em distribuição fora de escopo.
- **Remover `isImmutable` inteiramente, deixando tudo por versão.** Deixaria
  `PATCH`/`DELETE`/destinação sem gate coerente: excluir o documento levaria a
  versão assinada junto, e nenhum predicado de versão detecta isso.
- **Bloquear a gravação da versão assinada quando houver plano ativo, sem gate
  na abertura da sessão.** Recusaria a persistência de assinatura já emitida —
  no `LACUNA_BRIDGE`, produzida fora do TRAMA e irreproduzível. O gate precisa
  ser antecipado para a preparação da sessão; a gravação por origem declarada
  permanece isenta.

## Implementação

- `docs/arquitetura/ADRs.md` (este registro)
- Banco: nenhuma alteração de schema
- Backend: `apps/api/src/modules/documents/document-immutability.service.ts`
  (`isVersionImmutable`), `apps/api/src/modules/documents/documents.service.ts`
  (`reserveVersion`, `finalizeVersion`),
  `apps/api/src/modules/signatures/signatures.service.ts`,
  `apps/api/src/modules/signatures/signature-session.service.ts`,
  `apps/api/src/modules/signatures/signature-requests.service.ts`
- Frontend: `apps/web/src/pages/documents/DocumentDetailPage.tsx`,
  `apps/web/src/components/processes/ProcessDocumentsCard.tsx`,
  `apps/web/src/components/documents/DocumentStatusBadge.tsx`,
  `apps/web/src/pages/documents/DocumentsPage.tsx`,
  `apps/web/src/components/documents/DocumentPreviewPanel.tsx`
- `openspec/specs/documentos/spec.md`, `openspec/specs/assinaturas/spec.md`,
  `openspec/changes/tornar-imutabilidade-documental-por-versao/`

### Nota complementar (2026-09-25): reclassificação isolada não passa pelo gate por documento

O gate por documento (`isImmutable`) deixa de barrar o `PATCH /documents/:id`
que altera **somente** `classId`. Os demais metadados de documento com evidência
de assinatura continuam imutáveis, e qualquer outro campo no mesmo pedido faz o
gate voltar a valer.

A razão do gate — "alterar metadados muda o contexto de uma assinatura
existente" — vale para título, descrição, tipo, metadados e acesso, que
descrevem o que foi assinado. Não vale para a classificação arquivística: ela
não entra no PDF assinado nem na evidência de assinatura, que referenciam versão
e hash, e sim governa prazo de guarda e destinação final. Mantida imutável, uma
classificação errada em documento assinado ficava definitiva justamente no
acervo que chega à destinação. É o mesmo argumento que já tornava a
reclassificação isolada exceção ao gate de documento arquivado
(`openspec/changes/archive/2026-09-17-permitir-reclassificar-arquivado-e-ocultar-retido/`).

Os gates de assinatura ICP A1 em processamento e de classe estrutural continuam
aplicados, e a reclassificação é auditada com a classe anterior e a nova em
`DOCUMENT_UPDATED`.

Ver `openspec/changes/resolver-cinco-achados-de-metadados-documentais/`
(`design.md`, D1) e `apps/api/src/modules/documents/documents.service.ts`
(`update`).


### Nota complementar (2026-10-26): a lista de editores não passa pelo gate por documento

O `PATCH /documents/:id` que altera **somente** `allowedEditorIds` deixa de
passar pelo gate por documento (`isImmutable`), como a reclassificação isolada.
Visibilidade, perfis, usuários e setores de documento com evidência de
assinatura continuam imutáveis, e qualquer outro campo no mesmo pedido faz o
gate voltar a valer.

A nota de 2026-09-25 incluiu o "acesso" entre o que descreve o que foi
assinado. A lista de editores é a exceção: ela não entra no PDF assinado nem na
evidência de assinatura, que referenciam versão e hash. Em documento assinado,
o editor não altera metadados, porque o gate continua para ele; o que ele ganha
é criar versão nova, que não consulta imutabilidade, e mover o documento para
um processo. Sem a exceção, o autor do documento assinado não conseguia incluir
quem precisa juntá-lo a um processo, e a cópia, que não recebe assinatura, era a
única saída.

Na mesma mudança, o autor passa a gerenciar a lista de editores do próprio
documento sem `documents.manage_acl`. A alteração é auditada em
`DOCUMENT_ACL_UPDATED`. Ver
`openspec/changes/liberar-mover-de-documento-com-historico/` (`design.md`, D4 e
D5).

### Nota complementar (2026-10-26): alcance de leitura por versão

Quem lê o documento só por um ato (comunicação, solicitação ou plano de
assinaturas) alcança só as versões desse ato. Ver ADR-044.

### Nota complementar (2026-10-26): documento emitido

O documento comunicado é emitido e não recebe versão nova de conteúdo; a
correção é uma retificação, que é documento novo. A imutabilidade continua
sendo da versão: a trava nova é de emissão. Ver ADR-045.
