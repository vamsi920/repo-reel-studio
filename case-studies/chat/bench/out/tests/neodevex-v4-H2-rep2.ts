
import { Hono } from '../../hono'
import { describe, it, expect } from 'vitest'

describe('Hono Router Benchmarking', () => {
  it('1. should use RegExpRouter with only ordinary routes', async () => {
    const app = new Hono()
    app.get('/foo', (c) => c.text('foo'))

    await app.request('/foo')
    expect(app.router.activeRouter.name).toBe('RegExpRouter')
  })

  it('2. should fall back to TrieRouter and still answer requests correctly', async () => {
    const app = new Hono()
    app.get('/foo/:bar{.*}', (c) => c.text(`Param: ${c.req.param('bar')}`))
    app.get('/bar', (c) => c.text('bar'))

    const res1 = await app.request('/foo/baz')
    await expect(res1.text()).resolves.toBe('Param: baz')

    const res2 = await app.request('/bar')
    await expect(res2.text()).resolves.toBe('bar')

    expect(app.router.activeRouter.name).toBe('TrieRouter')
  })

  it('3. should throw an error when adding a route after the first request has been handled', async () => {
    const app = new Hono()
    app.get('/baz', (c) => c.text('baz'))

    await app.request('/baz')

    expect(() => {
      app.get('/qux', (c) => c.text('qux'))
    }).toThrow()
  })
})
