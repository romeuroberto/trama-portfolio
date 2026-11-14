/*
 * Excerpt from TRAMA (private repository) — custom type-aware ESLint rule (ADR-021):
 * forbids TypeORM repository calls outside tenantTransactions.run(), so no query can
 * bypass the transaction that sets app.tenant_id for Row Level Security.
 * Original path: apps/api/eslint-rules/no-repo-outside-transaction.js
 */

const bannedMethods = new Set([
  'find',
  'findOne',
  'findOneBy',
  'findBy',
  'findAndCount',
  'findAndCountBy',
  'save',
  'update',
  'delete',
  'remove',
  'softDelete',
  'restore',
  'insert',
  'count',
  'exists',
  'increment',
  'decrement',
  'query',
  'createQueryBuilder',
]);

function isThisProperty(node) {
  return (
    node &&
    node.type === 'MemberExpression' &&
    node.object &&
    node.object.type === 'ThisExpression' &&
    !node.computed
  );
}

function getPropertyName(node) {
  if (!node || node.type !== 'MemberExpression' || node.computed) {
    return undefined;
  }

  return node.property && node.property.type === 'Identifier' ? node.property.name : undefined;
}

function isTenantTransactionsRun(node) {
  if (!node || node.type !== 'CallExpression') {
    return false;
  }

  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) {
    return false;
  }

  if (getPropertyName(callee) !== 'run') {
    return false;
  }

  const receiver = callee.object;
  return isThisProperty(receiver) && getPropertyName(receiver) === 'tenantTransactions';
}

function isInsideTenantTransactionRun(context, node) {
  const ancestors = context.sourceCode.getAncestors(node);
  return ancestors.some(isTenantTransactionsRun);
}

function hasTypeormRepositorySymbol(type, checker, seen = new Set()) {
  if (!type || seen.has(type)) {
    return false;
  }
  seen.add(type);

  if (type.isUnion && type.isUnion()) {
    return type.types.some((member) => hasTypeormRepositorySymbol(member, checker, seen));
  }

  const symbol = type.aliasSymbol || type.getSymbol();
  const declarations = symbol ? symbol.getDeclarations() || [] : [];
  if (
    symbol &&
    symbol.getName() === 'Repository' &&
    declarations.some((declaration) =>
      declaration.getSourceFile().fileName.replace(/\\/g, '/').includes('/typeorm/'),
    )
  ) {
    return true;
  }

  const target = type.target;
  if (target && target !== type && hasTypeormRepositorySymbol(target, checker, seen)) {
    return true;
  }

  const apparent = checker.getApparentType(type);
  if (apparent && apparent !== type) {
    return hasTypeormRepositorySymbol(apparent, checker, seen);
  }

  return false;
}

function isTypeormRepository(context, node) {
  const services = context.sourceCode.parserServices;
  if (!services || !services.program || !services.esTreeNodeToTSNodeMap) {
    return false;
  }

  const checker = services.program.getTypeChecker();
  const tsNode = services.esTreeNodeToTSNodeMap.get(node);
  const type = checker.getTypeAtLocation(tsNode);

  return hasTypeormRepositorySymbol(type, checker);
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Bloqueia chamadas diretas a Repository<T> injetado fora de TenantTransactionService.run.',
    },
    messages: {
      outsideTransaction:
        'Use manager.getRepository(...) dentro de tenantTransactions.run em vez de chamar Repository<T> injetado diretamente fora da transação.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (!callee || callee.type !== 'MemberExpression' || callee.computed) {
          return;
        }

        const methodName = getPropertyName(callee);
        if (!methodName || !bannedMethods.has(methodName)) {
          return;
        }

        if (!isThisProperty(callee.object)) {
          return;
        }

        if (isInsideTenantTransactionRun(context, node)) {
          return;
        }

        if (!isTypeormRepository(context, callee.object)) {
          return;
        }

        context.report({
          node: callee.property,
          messageId: 'outsideTransaction',
        });
      },
    };
  },
};

module.exports.bannedMethods = bannedMethods;
