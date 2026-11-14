> Cópia do ADR original do TRAMA, publicada como amostra do processo de decisão. Caminhos de arquivo, changes OpenSpec e IDs de achado (`ACH-…`) referem-se ao repositório privado.

# ADR-049: Matriz de Acesso por Rota

**Status:** vigente

**Data:** 2026-11-11
**Relaciona-se com:** `openspec/changes/archive/2026-11-12-declarar-matriz-de-acesso-por-rota/`,
`openspec/changes/executar-matriz-de-acesso-por-rota/`,
`openspec/specs/politica-acesso-recursos/`, ADR-048

## Contexto

A ADR-048 deu dono à decisão de acesso sobre documento e processo, mas não
chega ao nível da rota. Nada liga cada uma das 304 rotas da API à regra que de
fato a protege. Pelo decorator, rota guardada por elegibilidade de etapa,
RN-031, solicitante ou participante de plano parece aberta a todo
`processes.act`. As 126 rotas só autenticadas dependem de checagem no service,
e o inventário da etapa 3 (`docs/seguranca-lgpd/Inventario-Rotas-Sem-Permissao.md`)
é uma fotografia, não uma garantia. Rota nova nasce sem regra declarada, e
nenhum teste enumera rotas.

## Decisão

1. **Matriz tipada, uma entrada por rota.** O arquivo
   `apps/api/src/shared/access-policy/route-matrix/route-access-matrix.ts`
   declara, por `"<VERBO> <caminho>"`, o decorator, as proteções reais, o que
   a rota cria ou altera e os estados de documento e de processo que a
   bloqueiam. A lista de proteções é conjuntiva. Rota cujo gate muda conforme
   o corpo, o recurso carregado ou a permissão do ator usa alternativas com
   condição explícita (`any_of`). Os tipos ficam fechados na primeira metade.
2. **Duas metades.**
   - **6a (`declarar-matriz-de-acesso-por-rota`):** a matriz e um teste
     estrutural, sem banco, que lê o metadado do Nest a partir do `AppModule`
     sem instanciá-lo. Ele reprova rota sem entrada, decorator divergente e
     rota que altera documento ou processo sem proteção do ato. Inclui também
     o documento gerado `docs/seguranca-lgpd/Matriz-Acesso-Rotas.md`, com o
     alcance por perfil estrutural padrão, e uma porta de aviso para delta de
     spec de acesso que não cita a matriz.
   - **6b (`executar-matriz-de-acesso-por-rota`):** os casos executáveis em
     PostgreSQL real.
3. **Prova por diferencial de fonte (6b).** O vínculo rota → regra é provado
   executando a rota com o ator tendo só a fonte mínima, e sem ela. Um espião
   sobre os métodos da política foi descartado, porque não vê a busca por
   fragmento do catálogo, a decisão por `forUser` nem a troca de ator na
   juntada (`runAsActor`).
4. **Declarado até ser provado.** Até a 6b ser arquivada, as proteções
   executáveis estão declaradas e conferidas só estruturalmente. O documento
   gerado diz isso no cabeçalho.
5. **Substitui o "negar por padrão" da etapa 3.** A matriz completa, com o
   teste que reprova rota sem entrada, cumpre o papel que um decorator de
   categoria cumpriria só por autodeclaração.
6. **Divergência corrige ou registra.** A rota cujo código diverge da regra
   não é declarada como deveria ser. Ela é corrigida na change, com delta de
   spec e nova revisão do trecho, ou declara `knownDefect` com um achado
   aberto.

## Alternativas descartadas

- **Matriz só documental.** Seria fotografia como o inventário da etapa 3, e
  envelheceria na primeira rota nova.
- **Descoberta subindo a aplicação.** O `AppModule` depende de Redis e Bull.
  O metadado do Nest basta para caminho, verbo e decorator.
- **Uma entrada por variante (`POST …/action#resubmit`).** Usaria uma chave que
  o Nest não conhece e quebraria a igualdade entre rotas descobertas e
  entradas.

## Consequências

- Toda rota nova entra na matriz, ou o `yarn test` reprova.
- **Pontos cegos assumidos:**
  - uma rota declarada fora de `resource_policy` que de fato usa a política
    não é detectada: o diferencial da 6b só executa as proteções declaradas
    (decisão do usuário de 2026-11-11, recorte da 6b);
  - o estado do próprio recurso filho (work item, plano, etapa) continua
    conferido só no service, até a etapa 7 centralizar os gates de estado;
  - o documento gerado reflete os perfis estruturais padrão do código, e não
    as edições do tenant nem as competências concedidas por usuário.
- A 6b executa também a permissão exigida no service (`permission.inService`)
  e o `needs` dos usos. Não executa `tenant_reference`, `domain_link`,
  `service_competency` nem conta própria por token.
- A execução da matriz roda na suíte e2e do pre-push, que bloqueia o push, e
  nunca sai dela para o job e2e do CI, que só relata. O teto de 300 s de
  parede da suíte é alarme, não critério de saída (decisão do usuário de
  2026-11-12).
- A saída do congelamento da Fase E exige as duas metades arquivadas.
- O formato do `knownDefect` (`ACH-*` conferido no `Registro-Achados.md`)
  muda se a migração do registro para issues for implementada; essa change
  adapta o tipo e o teste.
