import { it, expect } from 'vitest';
import { fromModel } from '../src/features/todos/mappers.ts';
import { record, todo } from './fixture.ts';

it.each(['open', 'doing', 'done'])('maps records to JSON without mutation (status: %s)', (status) => {
  const input = { ...record, status };
  const before = structuredClone(input);
  expect(fromModel(input)).toEqual({ ...todo, status });
  expect(input).toEqual(before);
});
it('preserves an absent due date', () => {
  expect(fromModel({ ...record, due_date: null }).due_date).toBeNull();
});
it('rejects invalid stored data', () => {
  expect(() => fromModel({ ...record, title: '' })).toThrow();
});
it.each(['closed', 'Done', ''])('rejects an unknown stored status %j', (status) => {
  expect(() => fromModel({ ...record, status })).toThrow();
});
it('drops a legacy completed column from the mapped task', () => {
  const legacy = { ...record, completed: true } as typeof record;
  expect(fromModel(legacy)).toEqual(todo);
});
it('returns HTML in stored text verbatim', () => {
  const html = '<script>alert(1)</script>';
  expect(fromModel({ ...record, title: html, description: html })).toEqual({ ...todo, title: html, description: html });
});
it('accepts stored text at the maximum lengths', () => {
  const title = 'x'.repeat(120);
  const description = 'd'.repeat(2000);
  expect(fromModel({ ...record, title, description })).toEqual({ ...todo, title, description });
  expect(() => fromModel({ ...record, title: 'x'.repeat(121) })).toThrow();
});
