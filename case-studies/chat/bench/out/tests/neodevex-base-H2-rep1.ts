
import { Hono } from '../../hono'
import { describe, it, expect } from 'vitest'

describe('Router Bench Test', () => {
  it('1. with only ordinary routes it ends up using RegExpRouter', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))
    app.post('/world', (c) => c.text('world'))

    let req = new Request('http://localhost/hello')
    await app.fetch(req)
    expect(app.router.activeRouter.name).toBe('RegExpRouter')
  })

  it('2. when a route RegExpRouter cannot handle is registered, it falls back to TrieRouter and still answers requests correctly', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))
    app.get('/:id{.*}', (c) => c.text('fallback')) // RegExpRouter cannot handle `(.*)` in parameter regex


    let req = new Request('http://localhost/hello')
    let res = await app.fetch(req)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')
    expect(app.router.activeRouter.name).toBe('TrieRouter')

    req = new Request('http://localhost/hello')
    res = await app.fetch(req)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')

    req = new Request('http://localhost/something')
    res = await app.fetch(req)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('fallback')
  })

  it('3. adding a route after the first request has been handled throws an error', async () => {
    const app = new Hono()
    app.get('/foo', (c) => c.text('foo'))

    let req = new Request('http://localhost/foo')
    await app.fetch(req)

    expect(() => {
      app.get('/bar', (c) => c.text('bar'))
    }).toThrowError('Can not add a route since the matcher is already built.')
  })
})
