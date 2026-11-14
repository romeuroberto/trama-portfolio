> Cópia do ADR original do TRAMA, publicada como amostra do processo de decisão. Caminhos de arquivo, changes OpenSpec e IDs de achado (`ACH-…`) referem-se ao repositório privado.

# ADR-015: OpenSpec como Governança de Mudanças Funcionais

**Data:** 2026-07-18
**Status:** vigente

> Status anterior à divisão (até 2026-10-29): Aceito


## Contexto

O TRAMA amadureceu com múltiplas frentes simultâneas: autenticação, processos,
documentos, assinatura, auditoria, LGPD, operação, homologação e design system.
Sem um trilho explícito, decisões documentais, funcionais e operacionais podem se
misturar e gerar perda de rastreabilidade.

## Decisão

OpenSpec é a camada oficial de governança para mudanças funcionais, técnicas,
operacionais, de segurança, dados, API e deploy que alterem comportamento,
contrato ou regra do produto.

Correções puramente documentais podem ocorrer dentro de changes documentais, mas
não podem canonizar nova regra funcional sem decisão registrada e, quando
aplicável, delta spec.

## Consequências

- Mudanças relevantes passam por `proposal.md`, `design.md`, delta spec e
  `tasks.md`.
- Documentos históricos deixam de ser fonte normativa direta.
- Arquivamento de change só deve ocorrer quando tarefas estiverem concluídas ou
  pendências forem explicitamente preservadas.
