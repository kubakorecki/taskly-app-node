import { afterEach, it, expect, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  return { database: createDatabase('postgresql://test:test@localhost:5432/test') };
}

const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('');

it('creates a Prisma client without connecting', () => {
  const { database } = setup();
  // The client is a Prisma proxy, not a plain PrismaClient instance, so check its surface.
  const connect = vi.spyOn(database, '$connect');
  for (const method of ['findMany', 'findUnique', 'findFirst', 'create', 'updateManyAndReturn', 'deleteMany'] as const) expect(typeof database.todo[method]).toBe('function');
  expect(typeof database.$executeRaw).toBe('function');
  expect(connect).not.toHaveBeenCalled();
});

it('creates the todos table with the validator limits', async () => {
  const { database } = setup();
  const executeRaw = vi.spyOn(database, '$executeRaw').mockResolvedValue(0 as never);
  vi.spyOn(database, '$transaction').mockResolvedValue([] as never);
  await initialize(database);
  expect(executeRaw).toHaveBeenCalledTimes(4);
  const sql = (executeRaw.mock.calls[0][0] as unknown as TemplateStringsArray).join('');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS todos');
  expect(sql).toContain('title VARCHAR(120) NOT NULL CONSTRAINT todo_title_not_empty CHECK (length(title) >= 1)');
  expect(sql).toContain("description VARCHAR(2000) NOT NULL DEFAULT ''");
  expect(sql).toContain("priority VARCHAR(6) NOT NULL DEFAULT 'medium' CONSTRAINT todo_priority CHECK (priority IN ('low', 'medium', 'high'))");
  expect(sql).toContain('completed BOOLEAN NOT NULL DEFAULT FALSE');
});

it('propagates a failed table creation', async () => {
  const { database } = setup();
  vi.spyOn(database, '$executeRaw').mockRejectedValue(new Error('permission denied for schema public'));
  await expect(initialize(database)).rejects.toThrow('permission denied for schema public');
});

it('adds the status column and backfills it from completed in one transaction after creating the table', async () => {
  const { database } = setup();
  const executeRaw = vi.spyOn(database, '$executeRaw').mockResolvedValue(0 as never);
  const transaction = vi.spyOn(database, '$transaction').mockResolvedValue([] as never);
  await initialize(database);
  expect(transaction).toHaveBeenCalledOnce();
  expect(transaction).toHaveBeenCalledWith(executeRaw.mock.results.slice(1).map((result) => result.value));
  expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(transaction.mock.invocationCallOrder[0]);
  const [addColumn, backfill, constrain] = executeRaw.mock.calls.slice(1).map((call) => sqlOf(call));
  expect(addColumn).toContain('ALTER TABLE todos ADD COLUMN IF NOT EXISTS status VARCHAR(5)');
  expect(addColumn).toContain("CONSTRAINT todo_status CHECK (status IN ('open', 'doing', 'done'))");
  expect(backfill).toBe("UPDATE todos SET status = CASE WHEN completed THEN 'done' ELSE 'open' END WHERE status IS NULL");
  expect(constrain).toBe("ALTER TABLE todos ALTER COLUMN status SET DEFAULT 'open', ALTER COLUMN status SET NOT NULL");
});

it('keeps the longest status within the column width', async () => {
  const { database } = setup();
  const executeRaw = vi.spyOn(database, '$executeRaw').mockResolvedValue(0 as never);
  vi.spyOn(database, '$transaction').mockResolvedValue([] as never);
  await initialize(database);
  const width = Number(/status VARCHAR\((\d+)\)/.exec(sqlOf(executeRaw.mock.calls[1]))?.[1]);
  expect(Math.max(...['open', 'doing', 'done'].map((status) => status.length))).toBe(width);
});

it('propagates a failed status migration', async () => {
  const { database } = setup();
  vi.spyOn(database, '$executeRaw').mockResolvedValue(0 as never);
  vi.spyOn(database, '$transaction').mockRejectedValue(new Error('check constraint "todo_status" is violated'));
  await expect(initialize(database)).rejects.toThrow('check constraint "todo_status" is violated');
});
