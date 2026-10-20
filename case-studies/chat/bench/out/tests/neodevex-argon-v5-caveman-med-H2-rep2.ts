import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'

describe('SmartRouter with default Hono()', () => {
  it('uses RegExpRouter when only ordinary routes are registered', async () => {
    const app = new Hono()
    app.get('/', (c) => c.text('root'))
    app.get('/users/:id', (c) => c.text(`user:${c.req.param('id')}`))

    const res = await app.request('/users/42')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('user:42')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')
  })

  it('falls back to TrieRouter when a route RegExpRouter cannot handle is registered and answers requests', async () => {
    const app = new Hono()
    app.get('/:user/entries', (c) => c.text(`entries:${c.req.param('user')}`))
    app.get('/entry/:name', (c) => c.text(`entry:${c.req.param('name')}`))
    app.get('/foo/:capture{ba(r|z)}', (c) => c.text(`capture:${c.req.param('capture')}`))

    const res1 = await app.request('/alice/entries')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('entries:alice')
    expect(app.router.name).toBe('SmartRouter + TrieRouter')

    const res2 = await app.request('/entry/hello')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('entry:hello')

    const res3 = await app.request('/foo/bar')
    expect(res3.status).toBe(200)
    expect(await res3.text()).toBe('capture:bar')
  })

  it('throws an error when adding a route after the first request has been handled', async () => {
    const app = new Hono()
    app.get('/first', (c) => c.text('first'))

    const res = await app.request('/first')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('first')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')

    expect(() => {
      app.get('/second', (c) => c.text('second'))
    }).toThrowError(new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT))
  })
})
