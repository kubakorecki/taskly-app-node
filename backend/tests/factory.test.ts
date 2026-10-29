import request from 'supertest';
import { readFileSync } from 'node:fs';
import { afterEach, it, expect, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import { createDatabase } from '../src/core/database.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  return { app: createApp(database), database, error };
}

it('serves health and the task routes', async () => {
  const { app, database } = setup();
  vi.spyOn(database.todo, 'findFirst').mockResolvedValue(null);
  vi.spyOn(database.todo, 'findMany').mockResolvedValue([record]);
  const health = await request(app).get('/api/health');
  expect(health.status).toBe(200);
  expect(health.body).toEqual({ status: 'ok' });
  expect(health.headers['x-powered-by']).toBeUndefined();
  const list = await request(app).get('/api/todos');
  expect(list.status).toBe(200);
  expect(list.body).toEqual([todo]);
});

it('serves the OpenAPI document and the docs UI', async () => {
  const { app } = setup();
  const specification = await request(app).get('/openapi.json');
  expect(specification.status).toBe(200);
  expect(specification.body).toEqual(JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8')));
  const docs = await request(app).get('/docs/');
  expect(docs.status).toBe(200);
  expect(docs.text).toContain('swagger-ui');
});

it('returns 404 JSON for unknown routes', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/unknown');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});

it('rejects malformed JSON with 422', async () => {
  const { app, database, error } = setup();
  const create = vi.spyOn(database.todo, 'create');
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title":');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
  expect(create).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

it('rejects oversized bodies with 413', async () => {
  const { app, database } = setup();
  const create = vi.spyOn(database.todo, 'create');
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send(JSON.stringify({ title: 'Task', description: 'x'.repeat(200_000) }));
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
  expect(create).not.toHaveBeenCalled();
});

it.each([new Error('connect ECONNREFUSED 10.0.0.5:5432'), 'connect ECONNREFUSED 10.0.0.5:5432'])('hides database failures behind a generic 500 (%s)', async (failure) => {
  const { app, database, error } = setup();
  vi.spyOn(database.todo, 'findMany').mockRejectedValue(failure);
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(response.text).not.toContain('ECONNREFUSED');
  expect(response.text).not.toContain('at ');
  expect(error).toHaveBeenCalledWith(failure);
});

it('hides other body parser failures behind a generic 500', async () => {
  const { app, database, error } = setup();
  const create = vi.spyOn(database.todo, 'create').mockResolvedValue(record);
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json; charset=x-unknown').send('{"title":"Task"}');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(response.text).not.toContain('x-unknown');
  expect(create).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledOnce();
});
