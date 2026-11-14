> Cópia do ADR original do TRAMA, publicada como amostra do processo de decisão. Caminhos de arquivo, changes OpenSpec e IDs de achado (`ACH-…`) referem-se ao repositório privado.

# ADR-042: Lacuna como Via Única de Assinatura ICP-Brasil; Remoção do A1 Próprio

**Status:** vigente

> Status anterior à divisão (até 2026-10-29): Aceito

**Data:** 2026-10-19
**Supersedes:** ADR-010, ADR-013, ADR-022 e a parte A1 do ADR-020; ajusta o
ADR-023
**Relaciona-se com:** `openspec/changes/remover-assinatura-a1-propria/` (D1 a
D12), ACH-20260906-005, ACH-20261017-001-homolo

## Contexto

O TRAMA mantinha duas vias de assinatura ICP-Brasil: o A1 próprio (ADR-020,
`.pfx` aberto num Web Worker do navegador, PAdES montado no backend, carimbo
de tempo Serpro/FreeTSA pelo ADR-022, validação de cadeia e revogação) e a
ponte Lacuna (ADR-023, A1 e A3 em nuvem). A Lacuna não reaproveita o motor A1:
monta PDF, CMS e carimbo de tempo por conta própria. O A1 próprio custava cerca
de 4 mil linhas de backend, 1 mil de frontend, 5 mil de testes, ~20 variáveis
de ambiente, duas rotinas agendadas e 44 dos 91 requisitos de `assinaturas`, e
o PDF gerado não mostrava o signatário visualmente. Nunca houve uso real do A1
próprio em produção ou na homologação oficial. A nota de 2026-10-13 no ADR-023,
que mantinha as duas vias em paralelo, é revertida.

## Decisão

**1. Via única.** A ponte Lacuna é a única via de assinatura ICP-Brasil, para
certificado A1 (arquivo) e A3 (token/smartcard). `POST /signature-sessions`
aceita só `providerType: LACUNA_BRIDGE`; o campo continua no contrato para
acomodar outro fornecedor de ponte no futuro. O uso depende do estado global
`SIGNATURE_LACUNA_MODULE_STATE` e do opt-in da instituição
(`settings.signature.lacuna.enabled`). Sem a Lacuna, resta a assinatura
simples com TOTP (ADR-024).

**2. Remoção.** Saem o provedor `BROWSER_PFX` (e o valor morto
`LOCAL_WEB_PKI`), o motor PAdES, a política de certificado, a TSA plugável, a
PKI de cadeia e revogação, as rotinas `check-certificate-revocation` e
`timestamp-pending-retry`, as rotas `GET /signature-sessions/module-state` e
`POST /signature-sessions/:sessionId/retry-timestamp`, os campos A1 do
contrato, `settings.signature.a1`, as variáveis `ICP_*`, `TSA_*`, `PADES_*`,
`CERTIFICATE_ACCEPTED_POLICY_OIDS` e `TIMESTAMP_PENDING_WINDOW_MS`, o diretório
`certs/` e as tabelas legadas `certificates`, `signatures` e
`signature_validations`.

**3. Proibição permanente de custódia.** O backend do TRAMA **nunca** recebe,
guarda ou processa `.pfx`/`.p12`, senha ou PIN de certificado, nem chave
privada — por nenhum provedor, atual ou futuro. Esta regra sobrevive à
remoção do A1 e não é reaberta por conveniência de implementação: qualquer
proposta que a contrarie exige nova ADR que a revogue expressamente.

**4. Evidência do signatário.** A conclusão da sessão Lacuna grava na sessão a
identidade do certificado (nome, serial, emissor, validade; CPF/CNPJ só como
hash e mascarado) e a preparação grava `signer_ip` (LGPD, Art. 7º, II,
retenção de 5 anos), nunca devolvidos por endpoint.

## Consequências

- Assinatura ICP-Brasil passa a depender de um fornecedor externo; indisponível
  a Lacuna (fora do ar, sem contrato ou `paused`), sobra só a assinatura
  simples. Aceito pelo usuário.
- O menu "Assinar" passa a oferecer simples e "Assinar com certificado
  digital" (Lacuna).
- Sessões, versões e signatários de teste vindos do A1 são removidos ou
  reabertos pela migration de remoção; o ambiente em que ela abortar é
  reseedado.
- Os documentos dedicados ao A1 vão para `docs/historico/assinaturas/` com
  nota de descontinuação.
