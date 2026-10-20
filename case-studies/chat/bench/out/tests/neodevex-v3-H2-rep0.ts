import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'
import { describe, it, expect } from 'vitest'

describe('Hono SmartRouter Benchmarks', () => {
  it('should use RegExpRouter for ordinary routes', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('Hello'))

    const req = new Request('http://localhost/hello')
    await app.fetch(req)

    // @ts-ignore: Accessing private property for testing
    expect(app.router.name).toContain('RegExpRouter')
  })

  it('should fall back to TrieRouter for unsupported routes and still answer correctly', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('Hello'))
    // Add a route that RegExpRouter cannot handle (e.g., a wildcard route)
    app.get('/:wildcard', (c) => c.text(`Wildcard: ${c.req.param('wildcard')}`))

    const req1 = new Request('http://localhost/foo')
    const res1 = await app.fetch(req1)
    expect(await res1.text()).toBe('Wildcard: foo')

    // @ts-ignore: Accessing private property for testing
    expect(app.router.name).toContain('TrieRouter')

    const req2 = new Request('http://localhost/hello')
    const res2 = await app.fetch(req2)
    expect(await res2.text()).toBe('Hello')

    const req3 = new Request('http://localhost/bar')
    const res3 = await app.fetch(req3)
    expect(await res3.text()).toBe('Wildcard: bar')
  })

  it('should throw an error when adding a route after the first request', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('Hello'))

    const req = new Request('http://localhost/hello')
    await app.fetch(req)

    // Attempt to add another route
    // @ts-ignore: Accessing private property for testing
    expect(() => app.get('/new-route', (c) => c.text('New Route'))).toThrow(
      MESSAGE_MATCHER_IS_ALREADY_BUILT
    )
  })
})
