import { afterEach, it, expect, vi } from 'vitest';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/lifespan.ts', () => ({ start: vi.fn() }));

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.mocked(start).mockReset();
  process.exitCode = undefined;
});

it('starts the API on import', async () => {
  vi.mocked(start).mockResolvedValue({} as Awaited<ReturnType<typeof start>>);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../src/main.ts');
  await new Promise((resolve) => setImmediate(resolve));
  expect(start).toHaveBeenCalledOnce();
  expect(error).not.toHaveBeenCalled();
  expect(process.exitCode).toBeUndefined();
});

it('logs a startup failure and sets a failing exit code', async () => {
  const failure = new Error('connect ECONNREFUSED 10.0.0.5:5432');
  vi.mocked(start).mockRejectedValue(failure);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../src/main.ts');
  await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Cannot start Taskly App Node API:', failure));
  expect(process.exitCode).toBe(1);
});
