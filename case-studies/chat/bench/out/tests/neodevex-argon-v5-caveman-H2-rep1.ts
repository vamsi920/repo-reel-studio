import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'

describe('SmartRouter with default Hono()', () => {
  it('uses RegExpRouter when only ordinary routes are registered', async () => {
    const app = new Hono()
    app.get('/', (c) => c.text('root'))
    app.get('/users/:id', (c) => c.text(`user:${c.req.param('id')}`))

    const res1 = await app.request('/')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('root')

    const res2 = await app.request('/users/123')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('user:123')

    expect(app.router.name).toBe('SmartRouter + RegExpRouter')
  })

  it('falls back to TrieRouter when a route RegExpRouter cannot handle is registered and answers requests correctly', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))
    app.get('/foo/:capture{ba(r|z)}', (c) => c.text(`capture:${c.req.param('capture')}`))
    app.get('/:user/entries', (c) => c.text(`entries:${c.req.param('user')}`))
    app.get('/entry/:name', (c) => c.text(`entry:${c.req.param('name')}`))

    const res1 = await app.request('/hello')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('hello')

    const res2 = await app.request('/foo/bar')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('capture:bar')

    const res3 = await app.request('/alice/entries')
    expect(res3.status).toBe(200)
    expect(await res3.text()).toBe('entries:alice')

    const res4 = await app.request('/entry/first')
    expect(res4.status).toBe(200)
    expect(await res4.text()).toBe('entry:first')

    expect(app.router.name).toBe('SmartRouter + TrieRouter')
  })

  it('throws an error when adding a route after the first request has been handled', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))

    const res = await app.request('/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')

    expect(() => {
      app.get('/after', (c) => c.text('after'))
    }).toThrow(new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT))
  })
})
