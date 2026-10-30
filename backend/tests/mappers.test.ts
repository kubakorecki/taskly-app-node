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
it.each(['archived', 'Done', ''])('rejects an unknown stored status %j', (status) => {
  expect(() => fromModel({ ...record, status })).toThrow();
});
it('rejects a stored ID that is not positive', () => {
  expect(() => fromModel({ ...record, id: 0 })).toThrow();
});
it('maps HTML in stored text verbatim', () => {
  const mapped = fromModel({ ...record, title: '<script>alert(1)</script>', description: '<b>bold</b>' });
  expect(mapped.title).toBe('<script>alert(1)</script>');
  expect(mapped.description).toBe('<b>bold</b>');
});
