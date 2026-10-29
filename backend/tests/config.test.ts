import { afterEach, it, expect, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

afterEach(() => vi.unstubAllEnvs());

const parts = { POSTGRES_USER: 'taskly', POSTGRES_PASSWORD: 'secret', POSTGRES_HOST: 'db.local', DB_PORT: '5433', POSTGRES_DB: 'taskly' };

function setup(env: Record<string, string> = {}) {
  for (const [name, value] of Object.entries({ DATABASE_URL: '', ...parts, ...env })) vi.stubEnv(name, value);
}

it('prefers an explicit override over DATABASE_URL', () => {
  setup({ DATABASE_URL: 'postgresql://env:env@env:5432/env' });
  expect(resolveDatabaseUrl('postgresql://override:pw@host:5432/db')).toBe('postgresql://override:pw@host:5432/db');
});

it('uses DATABASE_URL when no override is given', () => {
  setup({ DATABASE_URL: 'postgresql://env:env@env:5432/env' });
  expect(resolveDatabaseUrl()).toBe('postgresql://env:env@env:5432/env');
  expect(resolveDatabaseUrl('')).toBe('postgresql://env:env@env:5432/env');
});

it('rewrites the SQLAlchemy psycopg scheme to plain postgresql', () => {
  setup({ DATABASE_URL: 'postgresql+psycopg://env:env@env:5432/env' });
  expect(resolveDatabaseUrl()).toBe('postgresql://env:env@env:5432/env');
  expect(resolveDatabaseUrl('postgresql+psycopg://o:p@h:1/d')).toBe('postgresql://o:p@h:1/d');
});

it('builds the URL from the POSTGRES variables when DATABASE_URL is blank', () => {
  setup();
  expect(resolveDatabaseUrl()).toBe('postgresql://taskly:secret@db.local:5433/taskly');
});

it('encodes special characters in credentials and the database name', () => {
  setup({ POSTGRES_USER: 'us er', POSTGRES_PASSWORD: 'p@ss:w/rd', POSTGRES_DB: 'task db' });
  const url = new URL(resolveDatabaseUrl());
  expect(decodeURIComponent(url.username)).toBe('us er');
  expect(decodeURIComponent(url.password)).toBe('p@ss:w/rd');
  expect(url.hostname).toBe('db.local');
  expect(url.port).toBe('5433');
  expect(decodeURIComponent(url.pathname)).toBe('/task db');
});

it.each(Object.keys(parts))('throws when %s is missing or blank', (name) => {
  setup({ [name]: '' });
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});
