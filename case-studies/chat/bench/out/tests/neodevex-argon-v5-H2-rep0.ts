import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'

describe('SmartRouter with Hono', () => {
  it('Should use RegExpRouter when only ordinary routes are registered', async () => {
    const app = new Hono()
    app.get('/', (c) => c.text('root'))
    app.get('/users/:id', (c) => c.text(`user:${c.req.param('id')}`))

    const res = await app.request('/users/42')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('user:42')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')
  })

  it('Should fall back to TrieRouter when a route RegExpRouter cannot handle is registered and answer requests correctly', async () => {
    const app = new Hono()
    app.get('/:user/entries', (c) => c.text(`entries:${c.req.param('user')}`))
    app.get('/entry/:name', (c) => c.text(`entry:${c.req.param('name')}`))

    const res1 = await app.request('/alice/entries')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('entries:alice')
    expect(app.router.name).toBe('SmartRouter + TrieRouter')

    const res2 = await app.request('/entry/first')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('entry:first')
  })

  it('Should throw an error when adding a route after the first request has been handled', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))

    const res = await app.request('/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')

    expect(() => {
      app.get('/after', (c) => c.text('after'))
    }).toThrowError(MESSAGE_MATCHER_IS_ALREADY_BUILT)
  })
})
