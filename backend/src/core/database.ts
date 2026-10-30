import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Database } from '../features/todos/types.js';

export function createDatabase(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 10000 });
  return new PrismaClient({ adapter });
}

export async function initialize(database: Database): Promise<void> {
  // Compatible with the existing SQLAlchemy table and sequence.
  await database.$executeRaw`CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL CONSTRAINT todo_title_not_empty CHECK (length(title) >= 1),
    description VARCHAR(2000) NOT NULL DEFAULT '',
    priority VARCHAR(6) NOT NULL DEFAULT 'medium' CONSTRAINT todo_priority CHECK (priority IN ('low', 'medium', 'high')),
    due_date DATE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`;
  // Status replaces the legacy completed column. Only rows without a status are backfilled, so a rerun never overwrites it.
  await database.$transaction([
    database.$executeRaw`ALTER TABLE todos ADD COLUMN IF NOT EXISTS status VARCHAR(5)
      CONSTRAINT todo_status CHECK (status IN ('open', 'doing', 'done'))`,
    database.$executeRaw`UPDATE todos SET status = CASE WHEN completed THEN 'done' ELSE 'open' END WHERE status IS NULL`,
    database.$executeRaw`ALTER TABLE todos ALTER COLUMN status SET DEFAULT 'open', ALTER COLUMN status SET NOT NULL`,
  ]);
}
