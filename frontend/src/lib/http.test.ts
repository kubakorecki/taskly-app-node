import { afterEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../test/todoFixture'
import { request } from './http'

afterEach(() => vi.unstubAllGlobals())

const failed = 'The operation failed. Please try again.'

it('prefixes the API path and sends JSON headers with the given init', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json([todoFixture]))
  vi.stubGlobal('fetch', fetch)
  await expect(
    request('/todos/7', {
      method: 'PATCH',
      body: '{}',
      headers: { 'X-Trace': 'abc' },
    }),
  ).resolves.toEqual([todoFixture])
  expect(fetch).toHaveBeenCalledWith('/api/todos/7', {
    method: 'PATCH',
    body: '{}',
    headers: { 'Content-Type': 'application/json', 'X-Trace': 'abc' },
  })
})

it('sends JSON headers without an init', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json([]))
  vi.stubGlobal('fetch', fetch)
  await expect(request('/todos')).resolves.toEqual([])
  expect(fetch).toHaveBeenCalledWith('/api/todos', {
    headers: { 'Content-Type': 'application/json' },
  })
})

it('resolves to undefined for a 204 response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  )
  await expect(
    request(`/todos/${Number.MAX_SAFE_INTEGER}`, { method: 'DELETE' }),
  ).resolves.toBeUndefined()
})

it('keeps a __proto__ key in a response as plain data', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response('{"id":7,"__proto__":{"polluted":true}}', { status: 200 }),
      ),
  )
  const body = await request<Record<string, unknown>>('/todos/7')
  expect(body.id).toBe(7)
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
})

it('shows a string server detail as is', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: 'Task not found.' }, { status: 404 }),
      ),
  )
  await expect(request('/todos/7')).rejects.toThrow(
    new Error('Task not found.'),
  )
})

it('maps a non-string detail to the fixed failure message', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: [{ msg: 'internal' }] }, { status: 400 }),
      ),
  )
  await expect(request('/todos/-1')).rejects.toThrow(new Error(failed))
})

it('maps an unparseable error body to the fixed failure message', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('<html>Traceback: secret stack</html>', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    ),
  )
  await expect(request('/todos')).rejects.toThrow(new Error(failed))
})

it('maps a 422 to the fixed validation message regardless of detail', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: 'raw validator output' }, { status: 422 }),
      ),
  )
  await expect(request('/todos', { method: 'POST' })).rejects.toThrow(
    new Error(
      'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
    ),
  )
})

it('maps a network failure to the fixed connection message', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
  )
  await expect(request('/todos')).rejects.toThrow(
    new Error('Cannot connect to the server. Please try again.'),
  )
})

it('rethrows the original error when the request is aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abort = new DOMException('Aborted', 'AbortError')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abort,
  )
})

it('maps a failure with a live signal to the fixed connection message', async () => {
  const controller = new AbortController()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
  )
  await expect(
    request('/todos', { signal: controller.signal }),
  ).rejects.toThrow(
    new Error('Cannot connect to the server. Please try again.'),
  )
})
