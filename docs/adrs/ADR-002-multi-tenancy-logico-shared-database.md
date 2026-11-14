> Cópia do ADR original do TRAMA, publicada como amostra do processo de decisão. Caminhos de arquivo, changes OpenSpec e IDs de achado (`ACH-…`) referem-se ao repositório privado.

# ADR-002: Multi-Tenancy Lógico (Shared Database, Tenant ID)

**Data:** 2026-06-10
**Status:** vigente

> Status anterior à divisão (até 2026-10-29): Aceito

---

## Contexto

O DocFlow é um produto SaaS multi-tenant. Cada empresa cliente (tenant) deve ter seus dados completamente isolados dos demais. É preciso decidir como implementar esse isolamento no banco de dados.

**Restrições conhecidas:**
- Produto híbrido: mesmo código roda como SaaS (multi-tenant) e on-premise (single-tenant)
- Equipe pequena — estratégias complexas aumentam o custo de manutenção
- Clientes iniciais são médias empresas (dados moderados, não petabytes)
- PostgreSQL como banco definido (ADR-001)

**Critérios de decisão:**
1. Isolamento de dados (segurança e compliance LGPD)
2. Custo operacional (número de instâncias/schemas gerenciados)
3. Simplicidade de desenvolvimento
4. Facilidade de migração de dados (on-boarding e off-boarding de clientes)

---

## Alternativas Consideradas

### Opção A: Database por Tenant (Database-per-Tenant)
**Descrição:** Cada cliente tem seu próprio banco de dados PostgreSQL.

**Prós:**
- Isolamento máximo — vazamento de dados entre tenants é impossível por design
- Backup e restore por cliente independente
- Customização de schema por cliente possível

**Contras:**
- N bancos para gerenciar (N = número de clientes)
- Migrations precisam rodar em todos os bancos
- Conexões de pool multiplicadas por N
- Inviável para SaaS com centenas de clientes pequenos

**Avaliação pelos critérios:**
| Critério | Score (1-5) | Justificativa |
|---|---|---|
| Isolamento de dados | 5 | Máximo possível |
| Custo operacional | 1 | Cresce linearmente com clientes |
| Simplicidade de dev | 2 | Lógica de roteamento de conexão complexa |
| Migração de dados | 5 | Restore individual simples |

---

### Opção B: Schema por Tenant (Schema-per-Tenant)
**Descrição:** Um banco PostgreSQL, N schemas — um por cliente. Tabelas replicadas em cada schema.

**Prós:**
- Bom isolamento lógico
- Migrations via Flyway/Liquibase aplicadas por schema
- Restore parcial possível

**Contras:**
- PostgreSQL degrada com > 100 schemas ativos
- Complexidade de migrations: rodar em todos os schemas ao mesmo tempo
- ORM (TypeORM/Prisma) tem suporte limitado e frágil a schemas dinâmicos

**Avaliação pelos critérios:**
| Critério | Score (1-5) | Justificativa |
|---|---|---|
| Isolamento de dados | 4 | Bom, mas mesmos binários e WAL |
| Custo operacional | 3 | Moderado — schema explosion acima de 200 tenants |
| Simplicidade de dev | 2 | ORM com schemas dinâmicos é frágil |
| Migração de dados | 4 | Possível mas trabalhoso |

---

### Opção C: Shared Database, Shared Schema (tenant_id em todas as tabelas)
**Descrição:** Um banco, um schema. Todas as tabelas têm coluna `tenant_id UUID NOT NULL`. Row-Level Security (RLS) do PostgreSQL garante que queries nunca cruzem tenants.

**Prós:**
- Uma migration roda uma vez para todos os clientes
- ORM padrão sem customizações
- Escala para centenas de clientes sem overhead
- PostgreSQL RLS garante isolamento em nível de banco, como segunda camada de defesa

**Contras:**
- Isolamento por software (tenant_id) — bug de programação pode vazar dados entre tenants
- Backup/restore por tenant exige lógica específica (pg_dump com filtro)
- Dados de todos os clientes no mesmo volume físico

**Avaliação pelos critérios:**
| Critério | Score (1-5) | Justificativa |
|---|---|---|
| Isolamento de dados | 3 | Bom com RLS; requer disciplina de desenvolvimento |
| Custo operacional | 5 | Mínimo — um banco, uma migration |
| Simplicidade de dev | 5 | ORM padrão + middleware que injeta tenant_id |
| Migração de dados | 3 | Possível com filtros, menos trivial |

---

## Decisão

**Escolhemos: Opção C — Shared Database com RLS**

Para o estágio atual do produto e perfil de clientes (médias empresas, sem volume extremo), o shared database com `tenant_id` oferece simplicidade máxima de operação. O risco de vazamento entre tenants é mitigado em duas camadas: (1) middleware NestJS que injeta `tenant_id` em todas as queries via TypeORM Global Scope e (2) Row-Level Security habilitado no PostgreSQL como camada de banco. Para clientes on-premise, o isolamento é automático (single-tenant por definição). O código é idêntico nos dois modos — a diferença é apenas que no on-premise o `tenant_id` é sempre o mesmo UUID fixo.

---

## Consequências

### Positivas
- Migrations simples: `npm run migration:run` atualiza todos os tenants de uma vez
- Onboarding de novo cliente: INSERT em `tenants` + criação de usuário Admin
- Código de query idêntico para SaaS e on-premise

### Negativas / Trade-offs aceitos
- Todo NestJS Guard e Repository deve injetar `tenant_id` no contexto — requer disciplina e code review rigoroso
- Auditoria de acesso cross-tenant impossível de detectar apenas pelo banco (depende de logs de aplicação)

### Riscos e Mitigações
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Bug que vaza dados entre tenants | Baixa | Crítico | RLS no PostgreSQL + testes de integração com 2 tenants distintos em cada suite |
| Volume de um tenant degrada performance de outros | Baixa | Médio | Índices incluem `tenant_id` como primeiro campo; monitoramento por tenant_id |

---

## Implementação

**Impacta:**
- [x] Backend
- [x] Banco de dados

**Padrão de implementação:**

```typescript
// 1. Middleware extrai tenant do JWT e coloca no AsyncLocalStorage
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.user?.tenantId;
    TenantContext.run(tenantId, next);
  }
}

// 2. Base Repository injeta tenant_id automaticamente em todas as queries
abstract class BaseRepository<T> {
  protected get tenantId(): string {
    return TenantContext.get(); // lança erro se não definido
  }

  findAll(options?: FindManyOptions<T>) {
    return this.repo.find({
      ...options,
      where: { ...options?.where, tenantId: this.tenantId }
    });
  }
}

// 3. RLS no PostgreSQL como segunda camada
-- ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON documents
--   USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

**Estado validado em 2026-06-23:**

- RLS foi habilitado nas tabelas persistentes de tenant;
- políticas usam `USING` e `WITH CHECK`, bloqueando leitura e escrita cross-tenant;
- ausência de `app.tenant_id` resulta em zero linhas para roles sujeitas a RLS;
- tabelas associativas sem `tenant_id` direto validam o tenant por suas relações;
- os testes usam uma role `NOSUPERUSER NOBYPASSRLS`;
- transações TypeORM configuram `app.tenant_id` automaticamente por subscriber;
- API e worker assumem uma role `NOLOGIN/NOBYPASSRLS` quando há tenant no contexto;
- login e refresh usam a role SQL `trama_auth`, limitada a leitura em `users` e
  `refresh_tokens`, para a descoberta inicial da identidade;
- gravações de sessão e auditoria de autenticação ocorrem na transação restrita;
- workers de OCR e indexação recebem `tenantId` no payload e executam suas consultas
  por `TenantTransactionService`;
- processors de carimbo PDF e exportações de processo/auditoria também executam a
  leitura de metadados por `TenantTransactionService`; operações de storage,
  transformação de arquivos e e-mail ficam fora da transação;
- jobs globais obtêm somente UUIDs operacionais por uma função `SECURITY DEFINER`;
  a role `trama_tenant_enumerator` não possui leitura direta em `tenants`;
- o SLA reivindica etapas vencidas atomicamente e processa cada tenant em uma
  transação RLS independente;
- a expiração de planos de assinatura também usa reivindicação atômica por tenant;
  plano, participantes, requisitos, documentos, processo e auditoria são alterados
  na mesma transação;
- rejeição e cancelamento manual de planos persistem auditoria junto às mutações;
- a exportação ZIP direta resolve documentos, snapshots e auditoria na transação
  RLS, liberando a conexão antes de acessar storage e compactar os arquivos;
- `ProcessesService.findById` aceita o `EntityManager` do chamador para que
  autorização e mutação compartilhem role, tenant e conexão;
- abertura, cancelamento, desistência, menção e solicitação de exportação já usam
  esse caminho transacional;
- ações de etapa e reenvio bloqueiam o estado corrente e executam ação, avanço,
  planos derivados, notificações persistentes e auditoria na mesma transação;
- anexação e remoção documental reutilizam ACL do módulo de documentos dentro do
  `EntityManager` e bloqueiam vínculos antes de alterar;
- o valor é local à transação e foi validado com transações concorrentes;
- o teste controlado habilitou FORCE nas 26 tabelas em banco isolado;
- com login `NOSUPERUSER/NOBYPASSRLS`, uma consulta sem contexto retornou zero
  linhas e a mesma consulta em transação de tenant retornou os dados esperados;
- o smoke e a matriz HTTP falharam funcionalmente porque listagens e releituras
  ainda usam repositories fora da transação;
- o teste com credencial proprietária/superusuária foi considerado inválido, pois
  superusuários ignoram RLS mesmo com FORCE.

**Decisão atualizada em 2026-06-23:** o primeiro gate de FORCE foi reprovado e
guiou a separação de credenciais e a migração das queries autenticadas para o
`EntityManager` transacional.

O login próprio para API/worker foi implementado com três memberships mínimas.
Documentos e perfis são o primeiro recorte validado sob FORCE. A promoção dessa
credencial em produção continua bloqueada até os demais módulos listados em
`docs/seguranca-lgpd/Auditoria-Queries-FORCE-RLS.md` serem transacionais.

Usuários, setores, posições, categorias e tipos documentais também foram validados
sob FORCE. A descoberta do token de ativação reutiliza `trama_auth`, enquanto o
consumo ocorre na transação do tenant.

Próxima evolução obrigatória: migrar tipos de processo, listagens e caixa de
trabalho; depois notificações, auditoria, administração e busca.

Tipos de processo, listagem, detalhe, pendências e caixas de trabalho também foram
validados sob FORCE. Consultas compostas da caixa pessoal são sequenciais porque
compartilham uma única conexão transacional.

Próxima evolução obrigatória: migrar notificações, auditoria, administração e busca.

Notificações, auditoria, administração e busca PostgreSQL também foram validadas sob
FORCE. O inventário inicial de leituras autenticadas ficou sem bloqueadores
conhecidos.

Abertura de processo, mutações documentais, assinatura simples, `/tenants/me` e a
verificação pública por código foram migradas para transações de tenant ou
interfaces SQL mínimas. O smoke crítico integral passou com API e worker conectados
exclusivamente pelo login restrito e `FORCE ROW LEVEL SECURITY` ativo nas 26 tabelas
protegidas.

Gestão arquivística recebeu RLS em oito tabelas adicionais e seus services passaram
a usar transações de tenant. A matriz HTTP ampla passou com 25 endpoints, incluindo
endpoints arquivísticos, e o teste negativo HTTP entre dois tenants confirmou
`404` no acesso cruzado a documento. O gate controlado agora cobre 34 tabelas com
FORCE.

Os prefixos arquivísticos foram alinhados ao padrão canônico `/api/v1/archival/...`
e a matriz HTTP passou a validar esses caminhos.

Próxima evolução obrigatória: repetir smoke/matriz/negativos em staging com runbook
de ativação e rollback antes de ativar FORCE em produção.

**Métricas de validação:**
- 100% dos testes de integração rodam com 2 tenants distintos e verificam ausência de cross-tenant leakage
- Query explain de listagem de documentos usa índice `(tenant_id, created_at)` — nunca full scan
