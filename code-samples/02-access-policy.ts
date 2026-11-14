/*
 * Excerpt from TRAMA (private repository) — single access predicate shared by listing, by-ID check and target-user decision (ADR-048)
 * Original path: apps/api/src/shared/access-policy/access-policy.types.ts + access-policy.compose.ts
 * Published as a code sample only; it does not compile on its own.
 */

export interface SqlCondition {
  sql: string;
  params: Record<string, string | string[]>;
}

/**
 * Ator da decisão (D2). A fonte nunca lê `RequestContext`: recebe o ator
 * pronto, do usuário corrente ou de um usuário-alvo.
 */
export interface AccessActor {
  tenantId: string;
  userId: string;
  permissions: readonly string[];
  /** Slug do perfil: a única identidade de acesso (ADR-047). */
  profileSlug?: string;
  sectorIds: readonly string[];
  /**
   * `current`: o usuário autenticado da requisição; `target`: outro usuário,
   * montado por `AccessActorResolver.forUser`.
   */
  origin: 'current' | 'target';
}

/**
 * Uma fonte de acesso, declarada uma única vez no catálogo do domínio (D1).
 * `predicate` devolve o fragmento SQL que liga o ator ao recurso por esta
 * fonte, ou `null` quando a fonte não se aplica a este ator (permissão
 * ausente, lista vazia). A ordem do catálogo não tem efeito na decisão.
 */
export interface AccessSource<TAction extends string, TContext> {
  readonly id: string;
  readonly actions: readonly TAction[];
  /** Só no documento: `full` (integral) ou `act` (versões do ato, ADR-044). */
  readonly reach?: 'full' | 'act';
  /** Portão de permissão da fonte, quando há (ex.: `documents.read`). */
  readonly requiresPermission?: string;
  /** Fim de vigência, em texto curto, como a spec o cita. */
  readonly validity: string;
  predicate(context: TContext): SqlCondition | null;
}

// ─── access-policy.compose.ts ───


/** Condição que nunca casa: `OR` vazio falha fechado. */
export const NEVER: SqlCondition = { sql: '(1 = 0)', params: {} };

/** Condição que sempre casa (fonte que dispensa a ACL, como `records.read_all`). */
export const ALWAYS: SqlCondition = { sql: '(1 = 1)', params: {} };

/**
 * Leva o fragmento a uma consulta crua com parâmetros posicionais (`$n`), como
 * as da Minha Mesa: cada `:nome` vira o `$n` do valor acrescentado a `bind`, o
 * mesmo número para o mesmo nome. `::tipo` (cast) não é parâmetro.
 */
export function toPositional(condition: SqlCondition, bind: unknown[]): string {
  const numbers = new Map<string, number>();
  return condition.sql.replace(/(?<![:\w]):([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => {
    if (!(name in condition.params)) {
      throw new Error(`Parâmetro de política de acesso sem valor: ${name}`);
    }
    let position = numbers.get(name);
    if (position === undefined) {
      bind.push(condition.params[name]);
      position = bind.length;
      numbers.set(name, position);
    }
    return `$${position}`;
  });
}

/**
 * Público de um recurso numa expressão só (D16): um `CASE` por ator, cada um
 * com o predicado do próprio ator, que devolve o id do usuário quando casa.
 * Cada fragmento passa por `toPositional` em separado, então os parâmetros de
 * mesmo nome de atores diferentes ganham posições próprias.
 */
export function audienceExpression(
  entries: Array<{ userId: string; condition: SqlCondition }>,
  bind: unknown[],
): string {
  if (!entries.length) return 'ARRAY[]::text[]';
  const cases = entries.map((entry) => {
    const condition = toPositional(entry.condition, bind);
    bind.push(entry.userId);
    return `CASE WHEN ${condition} THEN $${bind.length}::text END`;
  });
  return `ARRAY_REMOVE(ARRAY[${cases.join(', ')}]::text[], NULL)`;
}

/**
 * Junta os parâmetros de vários fragmentos. O mesmo nome pode aparecer em
 * mais de uma fonte (o usuário, os setores), sempre com o mesmo valor; valor
 * divergente é erro de programação e falha alto, nunca em silêncio.
 */
export function mergeParams(conditions: Array<SqlCondition | null>): SqlCondition['params'] {
  const params: SqlCondition['params'] = {};
  for (const condition of conditions) {
    if (!condition) continue;
    for (const [name, value] of Object.entries(condition.params)) {
      if (name in params && JSON.stringify(params[name]) !== JSON.stringify(value)) {
        throw new Error(`Parâmetro de política de acesso com valores divergentes: ${name}`);
      }
      params[name] = value;
    }
  }
  return params;
}

/** `OR` dos fragmentos aplicáveis; sem nenhum, `NEVER`. */
export function anyOf(conditions: Array<SqlCondition | null>): SqlCondition {
  const present = conditions.filter((condition): condition is SqlCondition => Boolean(condition));
  if (!present.length) return NEVER;
  if (present.length === 1) return present[0];
  return {
    sql: `(${present.map((condition) => condition.sql).join(' OR ')})`,
    params: mergeParams(present),
  };
}

/** `AND` dos fragmentos; qualquer `null` vira `NEVER`. */
export function allOf(conditions: Array<SqlCondition | null>): SqlCondition {
  if (conditions.some((condition) => !condition)) return NEVER;
  const present = conditions as SqlCondition[];
  return {
    sql: `(${present.map((condition) => condition.sql).join(' AND ')})`,
    params: mergeParams(present),
  };
}

/**
 * Vetor de motivos da checagem por ID (D3): um `CASE` por fonte, com o mesmo
 * fragmento da listagem. `ARRAY_REMOVE(..., NULL)` deixa só as fontes que
 * casaram. Os ids de fonte são literais do catálogo (`snake_case`), nunca
 * entrada de usuário.
 */
export function reasonsExpression(
  entries: Array<{ id: string; condition: SqlCondition | null }>,
): SqlCondition {
  const applicable = entries.filter((entry): entry is { id: string; condition: SqlCondition } =>
    Boolean(entry.condition),
  );
  for (const entry of applicable) {
    if (!/^[a-z][a-z0-9_]*$/.test(entry.id)) {
      throw new Error(`Id de fonte de acesso inválido: ${entry.id}`);
    }
  }
  if (!applicable.length) return { sql: 'ARRAY[]::text[]', params: {} };
  return {
    sql: `ARRAY_REMOVE(ARRAY[${applicable
      .map((entry) => `CASE WHEN ${entry.condition.sql} THEN '${entry.id}' END`)
      .join(', ')}]::text[], NULL)`,
    params: mergeParams(applicable.map((entry) => entry.condition)),
  };
}
