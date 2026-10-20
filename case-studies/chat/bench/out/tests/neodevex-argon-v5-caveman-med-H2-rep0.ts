import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'

describe('SmartRouter with default Hono()', () => {
  it('uses RegExpRouter when only ordinary routes are registered', async () => {
    const app = new Hono()
    app.get('/', (c) => c.text('root'))
    app.get('/users/:id', (c) => c.text(`user:${c.req.param('id')}`))

    expect(app.router.name).toBe('SmartRouter')

    const res1 = await app.request('/')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('root')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')

    const res2 = await app.request('/users/42')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('user:42')
  })

  it('falls back to TrieRouter when a route RegExpRouter cannot handle is registered and answers requests correctly', async () => {
    const app = new Hono()
    app.get('/foo/:capture{ba(r|z)}', (c) => c.text(`captured:${c.req.param('capture')}`))
    app.get('/reg-exp/router', (c) => c.text('static'))
    app.get('/reg-exp/:id', (c) => c.text(`param:${c.req.param('id')}`))

    expect(app.router.name).toBe('SmartRouter')

    const res1 = await app.request('/foo/bar')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('captured:bar')
    expect(app.router.name).toBe('SmartRouter + TrieRouter')

    const res2 = await app.request('/foo/baz')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('captured:baz')

    const res3 = await app.request('/reg-exp/router')
    expect(res3.status).toBe(200)
    expect(await res3.text()).toBe('static')

    const res4 = await app.request('/reg-exp/123')
    expect(res4.status).toBe(200)
    expect(await res4.text()).toBe('param:123')

    const resNotFound = await app.request('/foo/qux')
    expect(resNotFound.status).toBe(404)
  })

  it('throws an error when adding a route after the first request has been handled', async () => {
    const app = new Hono()
    app.get('/', (c) => c.text('hello'))

    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')

    expect(() => {
      app.get('/new-route', (c) => c.text('new'))
    }).toThrow(MESSAGE_MATCHER_IS_ALREADY_BUILT)
  })
})
