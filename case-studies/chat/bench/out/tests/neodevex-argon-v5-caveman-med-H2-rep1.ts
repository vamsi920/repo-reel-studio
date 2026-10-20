import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'

describe('SmartRouter with default Hono()', () => {
  it('uses RegExpRouter when only ordinary routes are registered', async () => {
    const app = new Hono()
    app.get('/', (c) => c.text('root'))
    app.get('/users/:id', (c) => c.text(`user:${c.req.param('id')}`))
    app.post('/posts', (c) => c.text('created'))

    expect(app.router.name).toBe('SmartRouter')

    const res1 = await app.request('/')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('root')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')

    const res2 = await app.request('/users/42')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('user:42')

    const res3 = await app.request('/posts', { method: 'POST' })
    expect(res3.status).toBe(200)
    expect(await res3.text()).toBe('created')
  })

  it('falls back to TrieRouter when a route RegExpRouter cannot handle is registered and answers requests correctly', async () => {
    const app = new Hono()
    app.get('/files/:name{.*}', (c) => c.text(`file:${c.req.param('name')}`))
    app.get('/:user/entries', (c) => c.text(`entries:${c.req.param('user')}`))
    app.get('/entry/:name', (c) => c.text(`entry:${c.req.param('name')}`))

    expect(app.router.name).toBe('SmartRouter')

    const res1 = await app.request('/files/a/b/c.txt')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('file:a/b/c.txt')
    expect(app.router.name).toBe('SmartRouter + TrieRouter')

    const res2 = await app.request('/alice/entries')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('entries:alice')

    const res3 = await app.request('/entry/first')
    expect(res3.status).toBe(200)
    expect(await res3.text()).toBe('entry:first')
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
    }).toThrow(MESSAGE_MATCHER_IS_ALREADY_BUILT)
  })
})
