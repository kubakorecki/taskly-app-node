import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { afterEach, it, expect, vi } from 'vitest';
import { createDatabase } from '../src/core/database.ts';
import { createHealthRouter } from '../src/api/health.ts';
import { record } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  const app = express();
  app.use('/api', createHealthRouter(database));
  const errors: unknown[] = [];
  const handleError: ErrorRequestHandler = (error, req, res, next) => { errors.push(error); res.status(500).json({ detail: 'Internal Server Error' }); };
  app.use(handleError);
  return { app, database, errors };
}

it.each([record, null])('reports ok when the database answers (%j)', async (row) => {
  const { app, database } = setup();
  const findFirst = vi.spyOn(database.todo, 'findFirst').mockResolvedValue(row);
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});

it('propagates a database failure to the error handler', async () => {
  const { app, database, errors } = setup();
  vi.spyOn(database.todo, 'findFirst').mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(500);
  expect(errors).toEqual([new Error('connect ECONNREFUSED 10.0.0.5:5432')]);
});

it('serves health on GET only', async () => {
  const { app, database } = setup();
  const findFirst = vi.spyOn(database.todo, 'findFirst');
  expect((await request(app).post('/api/health')).status).toBe(404);
  expect(findFirst).not.toHaveBeenCalled();
});
