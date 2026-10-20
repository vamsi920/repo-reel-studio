import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

describe('Hono Smart Router Bench', () => {
  // (1) with only ordinary routes it ends up using RegExpRouter
  it('should use RegExpRouter for ordinary routes', async () => {
    const app = new Hono()
    app.get('/foo', (c) => c.text('foo'))
    app.get('/bar', (c) => c.text('bar'))

    // Trigger router build
    await app.request('/foo')

    expect(app.router.name).toBe('SmartRouter + RegExpRouter')

    const res = await app.request('/foo')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('foo')
  })

  // (2) when a route RegExpRouter cannot handle is registered, it falls back to TrieRouter and still answers requests correctly
  it('should fall back to TrieRouter for unsupported routes and still answer correctly', async () => {
    const app = new Hono()
    app.get('/foo', (c) => c.text('foo'))
    app.get('/bar/:id', (c) => c.text(c.req.param('id'))) // RegExpRouter can handle this
    app.get('/api/v:version{[0-9]+}/users', (c) => c.text('API Users')) // RegExpRouter cannot handle this complex regex

    // Trigger router build
    await app.request('/foo')

    expect(app.router.name).toBe('SmartRouter + RegExpRouter')

    let res = await app.request('/foo')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('foo')

    res = await app.request('/bar/123')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('123')

    res = await app.request('/api/v1/users')
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('404 Not Found')
  })

  // (3) adding a route after the first request has been handled throws an error
  it('should throw an error when adding a route after the first request', async () => {
    const app = new Hono()
    app.get('/foo', (c) => c.text('foo'))

    await app.request('/foo') // First request, router is built

    expect(() => {
      app.get('/baz', (c) => c.text('baz'))
    }).toThrowError()
  })
})
