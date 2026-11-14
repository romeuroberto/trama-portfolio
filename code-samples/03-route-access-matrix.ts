/*
 * Excerpt from TRAMA (private repository) — declarative route access matrix (ADR-049): every HTTP route declares its real protections; a test fails on any undeclared route
 * Original path: apps/api/src/shared/access-policy/route-matrix/route-access.types.ts + route-access-matrix.ts
 * Published as a code sample only; it does not compile on its own.
 */

export interface RouteDecorator {
  public?: true;
  all?: readonly string[];
  any?: readonly string[];
}

/** Um uso da política da ADR-048 que a rota faz. */
export type PolicyUse = {
  /** De quem é o acesso conferido: o ator, ou outro sujeito da rota (o solicitante, na juntada). */
  subject?: 'actor' | 'requester';
  /** Permissões que dispensam ESTE uso no service (não a rota). */
  bypass?: readonly string[];
  /** Permissões que a política exige como pré-condição deste uso, além da fonte. */
  needs?: readonly string[];
} & (
  | { resource: 'document'; action: DocumentDecideAction | DocumentFilterAction }
  | { resource: 'document'; source: readonly DocumentAccessSourceId[] }
  | { resource: 'document'; grant: true }
  | { resource: 'process'; action: ProcessCatalogFragment }
);

/** A regra real das rotas de etapa, work item e plano. */

// ─── One of the 304 entries in route-access-matrix.ts ───

  // SignaturesController.sign — sig.svc:259-260 assertCanAccess (read); :262 arquivado 409; vínculo pend.svc:159-187
  // (pendência na versão ou fonte author, 403); muta o documento (assinatura da versão)
  'POST /documents/:id/sign': {
    decorator: {},
    protections: [
      {
        kind: 'resource_policy',
        requires: [{ resource: 'document', action: 'read', bypass: ['records.read_all'] }],
      },
      {
        kind: 'domain_link',
        check:
          'signatário pendente de solicitação pendente na versão, ou autor pela fonte author (pending-signature-request-signer.service.ts:145-187)',
      },
    ],
    mutates: ['document'],
    blockedStates: [
      { on: { resource: 'document', state: 'archived' }, via: 'path', status: HttpStatus.CONFLICT },
    ],
  },
