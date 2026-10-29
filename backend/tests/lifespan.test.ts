import { afterEach, it, expect, vi } from 'vitest';
import { start } from '../src/core/lifespan.ts';
import { createDatabase, initialize } from '../src/core/database.ts';
import { resolveDatabaseUrl } from '../src/core/config.ts';
import { createApp } from '../src/factory.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn() }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  process.exitCode = undefined;
});

function setup({ listenError = null as Error | null, port = '9001' } = {}) {
  vi.stubEnv('API_PORT', port);
  const database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  const server = {
    once: vi.fn((event: string, handler: (error: Error) => void) => { if (listenError) queueMicrotask(() => handler(listenError)); }),
    address: vi.fn(() => ({ port: 9001 })),
    close: vi.fn(),
  };
  const app = { listen: vi.fn((port: number, host: string, callback: () => void) => { if (!listenError) queueMicrotask(callback); return server; }) };
  vi.mocked(resolveDatabaseUrl).mockReset().mockReturnValue('postgresql://taskly:secret@db:5432/taskly');
  vi.mocked(createDatabase).mockReset().mockReturnValue(database as unknown as ReturnType<typeof createDatabase>);
  vi.mocked(initialize).mockReset().mockResolvedValue(undefined);
  vi.mocked(createApp).mockReset().mockReturnValue(app as unknown as ReturnType<typeof createApp>);
  const handlers: Record<string, () => void> = {};
  vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => { handlers[event] = handler; return process; }) as unknown as typeof process.once);
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  return { database, server, app, handlers, exit, log, error };
}

it('connects, initializes and listens on API_PORT', async () => {
  const { database, server, app, handlers, log } = setup();
  const result = await start();
  expect(result).toEqual({ server, database });
  expect(createDatabase).toHaveBeenCalledWith('postgresql://taskly:secret@db:5432/taskly');
  expect(database.$connect).toHaveBeenCalledOnce();
  expect(initialize).toHaveBeenCalledWith(database);
  expect(createApp).toHaveBeenCalledWith(database);
  expect(app.listen).toHaveBeenCalledWith(9001, '0.0.0.0', expect.any(Function));
  expect(log).toHaveBeenCalledWith('Taskly App Node API listening on port 9001');
  expect(Object.keys(handlers).sort()).toEqual(['SIGINT', 'SIGTERM']);
  expect(database.$disconnect).not.toHaveBeenCalled();
});

it('listens on port 8000 when API_PORT is blank', async () => {
  const { app } = setup({ port: '' });
  await start();
  expect(app.listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
});

it.each(['SIGTERM', 'SIGINT'])('closes the server and disconnects on %s', async (signal) => {
  vi.useFakeTimers();
  const { database, server, handlers, exit } = setup();
  await start();
  handlers[signal]();
  expect(server.close).toHaveBeenCalledOnce();
  await server.close.mock.calls[0][0]();
  expect(database.$disconnect).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(10000);
  expect(exit).not.toHaveBeenCalled();
  expect(process.exitCode).toBeUndefined();
});

it('logs a failed disconnect on shutdown and sets a failing exit code', async () => {
  vi.useFakeTimers();
  const { database, server, handlers, exit, error } = setup();
  await start();
  const failure = new Error('disconnect failed');
  database.$disconnect.mockRejectedValue(failure);
  handlers.SIGTERM();
  await server.close.mock.calls[0][0]();
  expect(error).toHaveBeenCalledWith(failure);
  expect(process.exitCode).toBe(1);
  vi.advanceTimersByTime(10000);
  expect(exit).not.toHaveBeenCalled();
});

it('forces exit when the server does not close within 10 seconds', async () => {
  vi.useFakeTimers();
  const { database, handlers, exit } = setup();
  await start();
  handlers.SIGTERM();
  vi.advanceTimersByTime(9999);
  expect(exit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(exit).toHaveBeenCalledWith(1);
  expect(database.$disconnect).not.toHaveBeenCalled();
});

it('disconnects and rethrows when connecting fails', async () => {
  const { database, app } = setup();
  database.$connect.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
  await expect(start()).rejects.toThrow('connect ECONNREFUSED 10.0.0.5:5432');
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(initialize).not.toHaveBeenCalled();
  expect(app.listen).not.toHaveBeenCalled();
});

it('disconnects and rethrows when initializing fails', async () => {
  const { database, app } = setup();
  vi.mocked(initialize).mockRejectedValue(new Error('permission denied'));
  await expect(start()).rejects.toThrow('permission denied');
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(app.listen).not.toHaveBeenCalled();
});

it('disconnects and rethrows when the server cannot listen', async () => {
  const { database, server, handlers, log } = setup({ listenError: new Error('listen EADDRINUSE: address already in use 0.0.0.0:9001') });
  await expect(start()).rejects.toThrow('listen EADDRINUSE');
  expect(server.once).toHaveBeenCalledWith('error', expect.any(Function));
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(log).not.toHaveBeenCalled();
  expect(handlers).toEqual({});
});
