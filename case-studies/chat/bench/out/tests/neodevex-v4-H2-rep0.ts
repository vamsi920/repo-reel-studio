import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'
import { describe, expect, it } from 'vitest'

describe('Smart Router Benchmarks', () => {
  it('should use RegExpRouter for ordinary routes', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('Hello'))
    app.get('/foo', (c) => c.text('Foo'))

    let res = await app.request('/hello')
    expect(app.router.activeRouter.name).toBe('RegExpRouter')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello')

    res = await app.request('/foo')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Foo')
  })

  it('should fall back to TrieRouter for complex routes and still answer requests correctly', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('Hello'))
    // A route that RegExpRouter cannot handle, forcing a fallback to TrieRouter
    app.get('/path/:id{.*}', (c) => c.text(`ID: ${c.req.param('id')}`))

    let res = await app.request('/hello')
    expect(app.router.activeRouter.name).toBe('TrieRouter')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello')

    res = await app.request('/path/some/value')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ID: some/value')
  })

  it('should throw an error when adding a route after the first request', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('Hello'))

    // Make a request to initialize the router
    await app.request('/hello')

    // Expect an error when adding a new route
    expect(() => {
      app.get('/new', (c) => c.text('New'))
    }).toThrowError(MESSAGE_MATCHER_IS_ALREADY_BUILT)
  })
})

