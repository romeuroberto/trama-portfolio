# Architecture Decision Records — selection

TRAMA keeps 45 ADRs. Each has a status (**current**, **historical** = superseded
by a named ADR, **revoked** = undone without successor). The full texts below
are unmodified copies in Brazilian Portuguese. The rest are summarized in
English.

## Full text included

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](ADR-001-arquitetura-monolitica-modular-para-mvp.md) | Modular monolith instead of microservices | current |
| [ADR-002](ADR-002-multi-tenancy-logico-shared-database.md) | Logical multi-tenancy: shared database, `tenant_id`, Row Level Security | current |
| [ADR-015](ADR-015-openspec-como-governanca-de-mudancas-funcionais.md) | OpenSpec as governance for every functional change | current |
| [ADR-036](ADR-036-imutabilidade-documental-e-da-versao.md) | Immutability belongs to the version, not to the document | current |
| [ADR-042](ADR-042-lacuna-como-via-unica-de-assinatura-icp-brasil.md) | External signing bridge as the only ICP-Brasil path; in-house A1 signing removed | current |
| [ADR-048](ADR-048-politica-de-acesso-por-recurso.md) | Resource access policy with a single predicate | current |
| [ADR-049](ADR-049-matriz-de-acesso-por-rota.md) | Route access matrix, declared and executed | current |

## Summarized

| ADR | Decision | Status |
|---|---|---|
| ADR-003 | S3-compatible storage behind one contract; AWS S3 with SSE-KMS in production | current |
| ADR-004 → ADR-031 | Elasticsearch planned, then **removed**: PostgreSQL FTS is the only search engine | historical → current |
| ADR-005 | Immediate access-token revocation by per-user security version | current |
| ADR-010 … ADR-014, ADR-020, ADR-022 | In-house A1 signing (PAdES-T, TSA, browser PFX), later superseded by ADR-042 | historical |
| ADR-021 | Type-aware lint rule for tenant-scoped repositories | current |
| ADR-023 | Signing bridge for ICP-Brasil A3 (later extended to A1 by ADR-042) | current |
| ADR-024 | Simple signature via TOTP replaces password-based signing | current |
| ADR-025 | Cloud-native hosting on AWS with Terraform, SSE-KMS only, IAM roles | current |
| ADR-026 | Real-time screen updates: resource-oriented WebSocket with Redis adapter | current |
| ADR-028, ADR-032 | Classification plan is the single taxonomy; retention derives only from it | current |
| ADR-034 | Document upload restricted to PDF | current |
| ADR-035, ADR-039 | Functional competence assigned per user, with a document axis | current |
| ADR-037 | Images built outside the instance, delivered by immutable tag | current |
| ADR-038 | Policy for error messages shown to users | current |
| ADR-041 | Support tickets in their own Postgres schema inside the monolith | current |
| ADR-043 | Every document has an owner process; attaching by move or copy | current |
| ADR-044 | Access derived from an act reaches only that act's versions | current |
| ADR-045 | Issued documents receive no new versions; correction by rectification | current |
| ADR-046 | Triage by organizational unit replaces person-to-person assistance links | current |
| ADR-047 | Base role retired; authorization only by profile | current |
