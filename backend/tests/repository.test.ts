import { afterEach, it, expect, vi } from 'vitest';
import { createDatabase } from '../src/core/database.ts';
import { TodoRepository } from '../src/features/todos/repository.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  // Construct the real Prisma delegate, but mock its IO: no PostgreSQL is needed.
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  return { database, repository: new TodoRepository(database) };
}

it('lists tasks in newest-first order and maps database rows', async () => {
  const { database, repository } = setup();
  const findMany = vi.spyOn(database.todo, 'findMany').mockResolvedValue([record]);
  expect(await repository.list()).toEqual([todo]);
  expect(findMany).toHaveBeenCalledWith({ orderBy: [{ created_at: 'desc' }, { id: 'desc' }] });
});
it('gets a task by ID and handles missing tasks', async () => {
  const { database, repository } = setup();
  const findUnique = vi.spyOn(database.todo, 'findUnique').mockResolvedValueOnce(record).mockResolvedValueOnce(null);
  expect(await repository.get(1)).toEqual(todo);
  expect(findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
  expect(await repository.get(2)).toBeNull();
});

it.each(['2026-10-15', null])('creates tasks with calendar dates and timestamps (%s)', async (due_date) => {
  const { database, repository } = setup();
  const date = due_date ? new Date(`${due_date}T00:00:00.000Z`) : null;
  const create = vi.spyOn(database.todo, 'create').mockResolvedValue({ ...record, due_date: date });
  expect(await repository.create({ title: 'Task', description: '', priority: 'medium', status: 'open', due_date }))
    .toEqual({ ...todo, due_date });
  const data = create.mock.calls[0][0].data;
  expect(data).toMatchObject({ title: 'Task', due_date: date });
  expect(data.created_at).toBeInstanceOf(Date);
  expect(data.updated_at).toEqual(data.created_at);
});

it('updates fields without clearing an omitted due date', async () => {
  const { database, repository } = setup();
  const update = vi.spyOn(database.todo, 'updateManyAndReturn').mockResolvedValue([{ ...record, status: 'done' }]);
  expect(await repository.update(1, { status: 'done' })).toEqual({ ...todo, status: 'done' });
  expect(update).toHaveBeenCalledWith({
    where: { id: 1 }, data: { status: 'done', due_date: undefined, updated_at: expect.any(Date) },
  });
});

it.each(['2026-10-15', null])('updates or clears a due date (%s)', async (due_date) => {
  const { database, repository } = setup();
  const date = due_date ? new Date(`${due_date}T00:00:00.000Z`) : null;
  const update = vi.spyOn(database.todo, 'updateManyAndReturn').mockResolvedValue([{ ...record, due_date: date }]);
  expect((await repository.update(1, { due_date }))?.due_date).toEqual(due_date);
  expect(update.mock.calls[0][0].data.due_date).toEqual(date);
});

it('returns null when updating a missing task', async () => {
  const { database, repository } = setup();
  vi.spyOn(database.todo, 'updateManyAndReturn').mockResolvedValue([]);
  expect(await repository.update(99, { title: 'Missing' })).toBeNull();
});

it('rejects empty or unknown update fields', async () => {
  const { database, repository } = setup();
  const update = vi.spyOn(database.todo, 'updateManyAndReturn');
  await expect(repository.update(1, {})).rejects.toThrow('Invalid update fields.');
  await expect(repository.update(1, JSON.parse('{"id":2}'))).rejects.toThrow('Invalid update fields.');
  expect(update).not.toHaveBeenCalled();
});

it('deletes tasks and handles missing tasks', async () => {
  const { database, repository } = setup();
  const remove = vi.spyOn(database.todo, 'deleteMany').mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
  expect(await repository.delete(1)).toBe(true);
  expect(remove).toHaveBeenCalledWith({ where: { id: 1 } });
  expect(await repository.delete(1)).toBe(false);
});

it('propagates database errors', async () => {
  const { database, repository } = setup();
  vi.spyOn(database.todo, 'findMany').mockRejectedValue(new Error('Database unavailable'));
  await expect(repository.list()).rejects.toThrow('Database unavailable');
});

it.each(['open', 'doing', 'done'] as const)('updates the status to %s', async (status) => {
  const { database, repository } = setup();
  const update = vi.spyOn(database.todo, 'updateManyAndReturn').mockResolvedValue([{ ...record, status }]);
  expect(await repository.update(7, { status })).toEqual({ ...todo, status });
  expect(update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status, due_date: undefined, updated_at: expect.any(Date) } });
});

it('creates a task with the given status', async () => {
  const { database, repository } = setup();
  const create = vi.spyOn(database.todo, 'create').mockResolvedValue({ ...record, status: 'doing' });
  expect((await repository.create({ title: 'Task', description: '', priority: 'medium', status: 'doing', due_date: null })).status).toBe('doing');
  expect(create.mock.calls[0][0].data.status).toBe('doing');
});

it.each(['{"completed":true}', '{"status":"done","completed":true}', '{"__proto__":{"admin":true}}', '{"constructor":{"prototype":{"admin":true}}}', '{"prototype":{"admin":true}}'])(
  'rejects legacy and prototype update fields: %s', async (body) => {
    const { database, repository } = setup();
    const update = vi.spyOn(database.todo, 'updateManyAndReturn');
    await expect(repository.update(1, JSON.parse(body))).rejects.toThrow('Invalid update fields.');
    expect(update).not.toHaveBeenCalled();
  },
);

it('stores and returns HTML in a title verbatim', async () => {
  const { database, repository } = setup();
  const title = '<script>alert(1)</script>';
  const create = vi.spyOn(database.todo, 'create').mockResolvedValue({ ...record, title });
  expect((await repository.create({ title, description: '', priority: 'medium', status: 'open', due_date: null })).title).toBe(title);
  expect(create.mock.calls[0][0].data.title).toBe(title);
});

it('propagates a failed update', async () => {
  const { database, repository } = setup();
  vi.spyOn(database.todo, 'updateManyAndReturn').mockRejectedValue(new Error('Database unavailable'));
  await expect(repository.update(1, { status: 'done' })).rejects.toThrow('Database unavailable');
});
