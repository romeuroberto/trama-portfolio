> Cópia do ADR original do TRAMA, publicada como amostra do processo de decisão. Caminhos de arquivo, changes OpenSpec e IDs de achado (`ACH-…`) referem-se ao repositório privado.

# ADR-001: Arquitetura Monolítica Modular para MVP

**Data:** 2026-06-10
**Status:** vigente

> Status anterior à divisão (até 2026-10-29): Aceito

**Consultados:** —

---

## Contexto

O TRAMA precisa ser entregue com uma equipe pequena (estimada: 3–5 devs) em 6–9 meses. O produto cobre 5 domínios distintos: autenticação, documentos, workflows, assinaturas e auditoria. É preciso decidir como organizar esses domínios: microsserviços independentes, monolito tradicional ou algo intermediário.

**Restrições conhecidas:**
- Equipe pequena — overhead operacional de microsserviços seria crítico
- Deploy on-premise deve ser simples (clientes sem equipe DevOps dedicada)
- Domínios compartilham dados com frequência (ex: auditoria precisa de contexto de todos os outros)
- Time sem experiência prévia em orquestração de microsserviços (Kubernetes complexo)

**Critérios de decisão:**
1. Velocidade de desenvolvimento e entrega
2. Simplicidade de deploy on-premise (Docker Compose)
3. Capacidade de extrair serviços no futuro, se necessário
4. Custo operacional

---

## Alternativas Consideradas

### Opção A: Microsserviços desde o início
**Descrição:** Cada domínio (auth, docs, workflow, signature, audit) como serviço independente com sua base de dados própria, comunicação via REST/gRPC e fila de eventos.

**Prós:**
- Escala independente por domínio
- Deploy e rollout independentes
- Isolamento de falhas

**Contras:**
- Complexidade operacional extrema para time pequeno
- Latência de rede entre serviços para operações transacionais
- Consistência eventual dificulta garantias de auditoria
- Deploy on-premise se torna impraticável sem Kubernetes

**Avaliação pelos critérios:**
| Critério | Score (1-5) | Justificativa |
|---|---|---|
| Velocidade de desenvolvimento | 2 | Boilerplate de integração entre serviços consome 40% do tempo |
| Simplicidade de deploy on-premise | 1 | Requer Kubernetes; clientes SMB não têm capacidade |
| Extraibilidade futura | 5 | Já está separado |
| Custo operacional | 2 | Alto: múltiplos processos, logs distribuídos, tracing obrigatório |

---

### Opção B: Monolito Tradicional (Big Ball of Mud)
**Descrição:** Uma única aplicação sem separação clara de domínios. Simples de começar, mas sem estrutura.

**Prós:**
- Início rápido
- Zero overhead de infraestrutura

**Contras:**
- Dívida técnica cresce exponencialmente
- Impossível extrair domínios no futuro sem reescrita
- Dificulta testes e onboarding de novos devs

**Avaliação pelos critérios:**
| Critério | Score (1-5) | Justificativa |
|---|---|---|
| Velocidade de desenvolvimento | 4 | Rápido no curto prazo, lento no médio |
| Simplicidade de deploy on-premise | 5 | Um container |
| Extraibilidade futura | 1 | Praticamente impossível sem reescrita |
| Custo operacional | 5 | Mínimo |

---

### Opção C: Monolito Modular (Modular Monolith)
**Descrição:** Uma única aplicação com módulos fortemente encapsulados, fronteiras de domínio explícitas, comunicação interna via interfaces bem definidas (não chamadas diretas entre camadas). Estruturado para que cada módulo possa virar serviço independente no futuro com esforço mínimo.

**Prós:**
- Um processo, um deploy, um Docker Compose
- Fronteiras claras evitam acoplamento indesejado
- Transações distribuídas desnecessárias (tudo no mesmo processo)
- NestJS tem suporte nativo a módulos com injeção de dependência
- Extração futura de módulos é viável com refactor incremental

**Contras:**
- Escala de forma menos granular que microsserviços
- Banco de dados compartilhado (gerenciado via schemas ou prefixos de tabela por módulo)

**Avaliação pelos critérios:**
| Critério | Score (1-5) | Justificativa |
|---|---|---|
| Velocidade de desenvolvimento | 5 | Foco em produto, não em plumbing |
| Simplicidade de deploy on-premise | 5 | docker-compose up |
| Extraibilidade futura | 4 | Fronteiras existem, extração requer esforço mas é possível |
| Custo operacional | 5 | Mínimo, monitoramento centralizado |

---

## Decisão

**Escolhemos: Opção C — Monolito Modular**

Para um produto em fase inicial com equipe pequena e forte requisito de deploy simples on-premise, o monolito modular oferece o melhor equilíbrio. O NestJS com seus módulos, decorators e injeção de dependência viabiliza fronteiras limpas sem overhead operacional. Quando o produto amadurecer e houver demanda por escala específica (ex: módulo de OCR consome muito CPU), a extração pode ser feita de forma cirúrgica. Microsserviços prematuros matariam a velocidade de entrega.

**Regra de ouro adotada:** módulos não importam classes diretamente uns dos outros — toda comunicação entre módulos ocorre via interfaces exportadas (NestJS module exports) ou eventos internos (EventEmitter). Isso garante a fronteira sem overhead de rede.

---

## Consequências

### Positivas
- `docker-compose up` funciona em qualquer servidor Linux com Docker — deploy on-premise sem fricção
- Time foca em features, não em infraestrutura distribuída
- Transações ACID disponíveis nativamente (sem Saga pattern)
- Auditoria centralizada trivial: todos os eventos no mesmo processo

### Negativas / Trade-offs aceitos
- Escala horizontal do worker de OCR exige separar esse módulo em processo separado (Worker container via Bull Queue — planejado desde o início)
- Banco compartilhado exige disciplina de não cruzar schemas entre módulos sem passar pela interface

### Riscos e Mitigações
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Acoplamento cresce com o time | Média | Alto | Code review obrigatório para imports entre módulos; lint rule para proibir imports diretos cross-module |
| Gargalo de escala no módulo de busca | Baixa | Médio | Busca roda em PostgreSQL FTS (ADR-031, que removeu o Elasticsearch); API de busca pode ser extraída se necessário |

---

## Implementação

**Impacta:**
- [x] Backend
- [x] Infraestrutura

**Estrutura de módulos NestJS:**
```
src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── tenants/
│   ├── documents/
│   ├── workflows/
│   ├── signatures/
│   ├── audit/
│   ├── notifications/
│   └── search/
├── shared/           # tipos, utils, decorators compartilhados
├── infrastructure/   # adapters: database, storage, queue, email
└── app.module.ts
```

**Regra de importação cross-module:**
- ✅ `AuthModule` exporta `AuthGuard` → `DocumentsModule` usa via NestJS DI
- ❌ `DocumentsService` importa diretamente `UsersRepository` de `users/`

**Métricas de validação:**
- Tempo de cold start < 5s
- `docker-compose up` funciona em servidor limpo em < 3 minutos
- Nenhum import direto cross-module no lint (regra ESLint custom)

---

## Referências
- [NestJS Modules Documentation](https://docs.nestjs.com/modules)
- [Modular Monolith — Sam Newman](https://samnewman.io/patterns/architectural/monolith/)
