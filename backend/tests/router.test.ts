import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn().mockResolvedValue([todo]), create: vi.fn().mockResolvedValue(todo), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('lists tasks from the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
});
it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: '  Plan the sprint  ', priority: 'high' });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(todo);
  expect(repository.create).toHaveBeenCalledWith({ title: 'Plan the sprint', description: '', priority: 'high', due_date: null, status: 'open' });
});
it.each([{ title: '  ' }, { title: 'x'.repeat(121) }, { title: 'Task', priority: 'urgent' }, { title: 'Task', due_date: '2026-02-30' }])(
  'rejects invalid create input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
it('accepts a title and description at their maximum lengths', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: 'x'.repeat(120), description: 'd'.repeat(2000) });
  expect(response.status).toBe(201);
  expect(repository.create).toHaveBeenCalledWith({ title: 'x'.repeat(120), description: 'd'.repeat(2000), priority: 'medium', due_date: null, status: 'open' });
});
it.each([{ title: '' }, {}, { title: 'Task', description: 'd'.repeat(2001) }, { title: 'Task', id: 1 }, { title: 'Task', completed: 'yes' }])(
  'rejects blank, oversized or unknown create fields without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
it.each(['{"title":"Task","__proto__":{"admin":true}}', '{"title":"Task","constructor":{"prototype":{"admin":true}}}', '{"title":"Task","prototype":{"admin":true}}'])(
  'rejects prototype keys in a create payload: %s', async (body) => {
    const { app, repository } = setup();
    const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send(body);
    expect(response.status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
it('stores HTML in a title verbatim', async () => {
  const { app, repository } = setup();
  await request(app).post('/api/todos').send({ title: '<script>alert(1)</script>', description: '<b>bold</b>' });
  expect(repository.create).toHaveBeenCalledWith({ title: '<script>alert(1)</script>', description: '<b>bold</b>', priority: 'medium', due_date: null, status: 'open' });
});
it('gets a task by ID', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(todo);
  const response = await request(app).get('/api/todos/1');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(1);
});
it('returns 404 for a missing task on get, update and delete', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(null);
  repository.update.mockResolvedValue(null);
  repository.delete.mockResolvedValue(false);
  for (const response of [await request(app).get('/api/todos/99'), await request(app).patch('/api/todos/99').send({ status: 'done' }), await request(app).delete('/api/todos/99')]) {
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ detail: 'Task not found.' });
  }
  expect(repository.update).toHaveBeenCalledWith(99, { status: 'done' });
  expect(repository.delete).toHaveBeenCalledWith(99);
});
it('updates a task with trimmed fields', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue({ ...todo, title: 'Renamed', status: 'done' });
  const response = await request(app).patch('/api/todos/1').send({ title: '  Renamed  ', status: 'done' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ...todo, title: 'Renamed', status: 'done' });
  expect(repository.update).toHaveBeenCalledWith(1, { title: 'Renamed', status: 'done' });
});
it.each([{}, { id: 2 }, { title: '' }, { title: '   ' }, { title: 'x'.repeat(121) }, { description: 'd'.repeat(2001) }, { priority: 'urgent' }, { due_date: '2026-13-01' }])(
  'rejects empty, blank or invalid update input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).patch('/api/todos/1').send(payload)).status).toBe(422);
    expect(repository.update).not.toHaveBeenCalled();
  },
);
it('rejects prototype keys in an update payload', async () => {
  const { app, repository } = setup();
  const response = await request(app).patch('/api/todos/1').set('Content-Type', 'application/json').send('{"__proto__":{"admin":true}}');
  expect(response.status).toBe(422);
  expect(repository.update).not.toHaveBeenCalled();
});
it('deletes a task', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(true);
  const response = await request(app).delete('/api/todos/1');
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  expect(repository.delete).toHaveBeenCalledWith(1);
});
it.each(['0', '-1', '1.5', 'abc', '9007199254740992'])('rejects invalid id %s without calling the repository', async (id) => {
  const { app, repository } = setup();
  for (const response of [await request(app).get(`/api/todos/${id}`), await request(app).patch(`/api/todos/${id}`).send({ completed: true }), await request(app).delete(`/api/todos/${id}`)]) {
    expect(response.status).toBe(422);
  }
  expect(repository.get).not.toHaveBeenCalled();
  expect(repository.update).not.toHaveBeenCalled();
  expect(repository.delete).not.toHaveBeenCalled();
});
it('propagates repository errors', async () => {
  const { app, repository } = setup();
  repository.list.mockRejectedValue(new Error('Database unavailable'));
  const errors: unknown[] = [];
  const handleError: ErrorRequestHandler = (error, req, res, next) => { errors.push(error); res.status(500).json({ detail: 'Internal Server Error' }); };
  app.use(handleError);
  expect((await request(app).get('/api/todos')).status).toBe(500);
  expect(errors).toEqual([new Error('Database unavailable')]);
});
