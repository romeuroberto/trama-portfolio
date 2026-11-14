# Code samples

Unmodified excerpts from the private TRAMA repository. They depend on the
rest of the codebase and are not meant to compile on their own. Comments are
in Brazilian Portuguese, as in the original.

### 01 — Tenant context in every transaction
[`01-tenant-rls.subscriber.ts`](01-tenant-rls.subscriber.ts)

A TypeORM subscriber runs right after each transaction starts. It validates
the tenant ID from the request context, switches to the restricted runtime role
(`SET LOCAL ROLE`) and sets `app.tenant_id` scoped to the transaction. The
appended policy shows how every tenant table filters by it, both for reads
(`USING`) and writes (`WITH CHECK`).

*Por que importa:* o isolamento entre órgãos não depende de nenhum
desenvolvedor lembrar do `WHERE tenant_id`; o banco recusa.

### 02 — Composable access predicates
[`02-access-policy.ts`](02-access-policy.ts)

The shared vocabulary of the resource access policy ([ADR-048](../docs/adrs/ADR-048-politica-de-acesso-por-recurso.md)):
an `AccessSource` returns a parameterized SQL fragment for an actor, and the
helpers combine fragments with `OR`/`AND`. Empty combinations collapse to
`(1 = 0)` (fail closed), and conflicting parameter values throw instead of
silently picking one. `reasonsExpression` turns the same fragments into a list
of the sources that granted access.

### 03 — Route access matrix
[`03-route-access-matrix.ts`](03-route-access-matrix.ts)

The type model behind the matrix ([ADR-049](../docs/adrs/ADR-049-matriz-de-acesso-por-rota.md))
and one of its 304 entries: signing a document requires read access (or the
`records.read_all` bypass), a pending signature link, mutates the document and is
blocked with `409` when the document is archived. Each entry's comment cites
the exact lines of code that implement it.

### 04 — Validating a signed PDF from an external provider
[`04-pdf-structural-signature-validator.ts`](04-pdf-structural-signature-validator.ts)

Before a PDF returned by the ICP-Brasil signing bridge becomes the official
version, the backend checks three objective properties: the last `/ByteRange`
correctly frames the `/Contents` placeholder, the CMS `SignedData` is well formed,
and a timestamp token is present. Incremental updates (DSS/LTV revisions,
multiple signers) are handled explicitly.

### 05 — Lint rule that protects tenant isolation
[`05-eslint-no-repo-outside-transaction.js`](05-eslint-no-repo-outside-transaction.js)

A type-aware ESLint rule ([ADR-021]) that uses the TypeScript type checker to find
calls on TypeORM `Repository` objects (`find`, `save`, `query`,
`createQueryBuilder`…) that are not inside `this.tenantTransactions.run(...)`.
Those calls would run without `app.tenant_id` and are rejected at lint time.

[ADR-021]: ../docs/adrs/README.md
