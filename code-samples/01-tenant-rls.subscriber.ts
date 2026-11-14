/*
 * Excerpt from TRAMA (private repository) — multi-tenancy: tenant context pushed into every PostgreSQL transaction
 * Original path: apps/api/src/infrastructure/database/tenant-rls.subscriber.ts
 * Published as a code sample only; it does not compile on its own.
 */

import { EventSubscriber, EntitySubscriberInterface, TransactionStartEvent } from 'typeorm';
import { RequestContext } from '@shared/context/request-context';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_PATTERN = /^[a-z_][a-z0-9_]*$/;

@EventSubscriber()
export class TenantRlsSubscriber implements EntitySubscriberInterface {
  async afterTransactionStart(event: TransactionStartEvent): Promise<void> {
    const tenantId = RequestContext.get()?.tenantId ?? '';
    const runtimeRole = process.env.DATABASE_RUNTIME_ROLE?.trim();
    if (tenantId && !UUID_PATTERN.test(tenantId)) {
      throw new Error('Invalid tenantId in request context');
    }
    if (runtimeRole && !ROLE_PATTERN.test(runtimeRole)) {
      throw new Error('Invalid DATABASE_RUNTIME_ROLE');
    }

    if (runtimeRole && tenantId) {
      await event.queryRunner.query(`SET LOCAL ROLE ${runtimeRole}`);
    }

    await event.queryRunner.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
  }
}


// ─── Row Level Security policy applied by migrations to every tenant-scoped table ───
// (excerpt from apps/api/src/infrastructure/database/migrations/1790900000000-RlsTabelasFaltantes.ts)
//
//       await queryRunner.query(`ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY`);
//       await queryRunner.query(`DROP POLICY IF EXISTS tenant_isolation_${tabela} ON ${tabela}`);
//       await queryRunner.query(`
//         CREATE POLICY tenant_isolation_${tabela} ON ${tabela}
//         USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
//         WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
//       `);
