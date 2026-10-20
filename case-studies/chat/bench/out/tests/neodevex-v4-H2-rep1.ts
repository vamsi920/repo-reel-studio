import { Hono } from '../../hono'
import { describe, it, expect } from 'vitest'

describe('Hono default SmartRouter behavior', () => {
  it('should use RegExpRouter for ordinary routes', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('Hello'))

    await app.request('/hello')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')
  })

  it('should fall back to TrieRouter for unsupported routes and still answer requests', async () => {
    const app = new Hono()
    // First, add a route that RegExpRouter cannot handle (complex capturing group).
    app.get('/foo/:capture{ba(r|z)}', (c) => c.text(`Captured: ${c.req.param('capture')}`))
    // Then add an ordinary route.
    app.get('/hello', (c) => c.text('Hello'))

    // Now, make a request to the unsupported route first, to force TrieRouter selection.
    const resTrie = await app.request('/foo/bar')
    expect(resTrie.status).toBe(200)
    expect(await resTrie.text()).toBe('Captured: bar')
    expect(app.router.name).toBe('SmartRouter + TrieRouter')

    // Verify the ordinary route still works with TrieRouter.
    const resHello = await app.request('/hello')
    expect(resHello.status).toBe(200)
    expect(await resHello.text()).toBe('Hello')
    expect(app.router.name).toBe('SmartRouter + TrieRouter')
  })

  it('should throw an error when adding a route after the first request', async () => {
    const app = new Hono()
    app.get('/initial', (c) => c.text('Initial'))

    await app.request('/initial')

    expect(() => {
      app.get('/new', (c) => c.text('New'))
    }).toThrow('Can not add a route since the matcher is already built.')
  })
})
