import { Hono } from '../../hono'
import { describe, it, expect } from 'vitest'

describe('Smart Router Benchmarks', () => {
  it('should use RegExpRouter for ordinary routes', async () => {
    const app = new Hono()
    app.get('/foo', (c) => c.text('foo'))
    app.get('/bar', (c) => c.text('bar'))

    await app.request('/foo') // Trigger router determination
    expect((app as any).router.activeRouter.name).toBe('RegExpRouter')

    let res = await app.request('/foo')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('foo')

    res = await app.request('/bar')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('bar')
  })

  it('should fall back to TrieRouter for unsupported routes and still answer correctly', async () => {
    const app = new Hono()
    app.get('/foo', (c) => c.text('foo'))
    // A route that RegExpRouter cannot handle, forcing a fallback to TrieRouter
    app.get('/users/me', (c) => c.text('Current User'))
    app.get('/users/:id', (c) => c.text(`User ID: ${c.req.param('id')}`))

    await app.request('/users/me') // Trigger router determination and fallback
    expect((app as any).router.activeRouter.name).toBe('TrieRouter')

    let res = await app.request('/foo')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('foo')

    res = await app.request('/users/me')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Current User')

    res = await app.request('/users/123')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('User ID: 123')
  })

  it('should throw an error when adding a route after the first request', async () => {
    const app = new Hono()
    app.get('/foo', (c) => c.text('foo'))

    // Make a request to initialize the router
    await app.request('/foo')

    expect(() => {
      app.get('/bar', (c) => c.text('bar'))
    }).toThrow()
  })
})
