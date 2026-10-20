import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'

describe('SmartRouter with default Hono()', () => {
  it('uses RegExpRouter when only ordinary routes are registered', async () => {
    const app = new Hono()

    app.get('/user', (c) => c.text('user'))
    app.get('/user/comments', (c) => c.text('comments'))
    app.get('/user/lookup/username/:username', (c) => c.text(`username:${c.req.param('username')}`))
    app.get('/event/:id', (c) => c.text(`event:${c.req.param('id')}`))
    app.post('/event/:id/comment', (c) => c.text(`comment:${c.req.param('id')}`))
    app.get('/static/*', (c) => c.text('static'))

    expect(app.router.name).toBe('SmartRouter')

    const res1 = await app.request('/user/lookup/username/alice')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('username:alice')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')

    const res2 = await app.request('/event/42/comment', { method: 'POST' })
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('comment:42')

    const res3 = await app.request('/static/app.js')
    expect(res3.status).toBe(200)
    expect(await res3.text()).toBe('static')
  })

  it('falls back to TrieRouter when a route RegExpRouter cannot handle is registered and answers requests correctly', async () => {
    const app = new Hono()

    app.get('/user', (c) => c.text('user'))
    app.get('/:user/entries', (c) => c.text(`entries:${c.req.param('user')}`))
    app.get('/entry/:name', (c) => c.text(`entry:${c.req.param('name')}`))
    app.get('/files/:name{.*}', (c) => c.text(`file:${c.req.param('name')}`))

    expect(app.router.name).toBe('SmartRouter')

    const res1 = await app.request('/user')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('user')
    expect(app.router.name).toBe('SmartRouter + TrieRouter')

    const res2 = await app.request('/alice/entries')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('entries:alice')

    const res3 = await app.request('/entry/hello')
    expect(res3.status).toBe(200)
    expect(await res3.text()).toBe('entry:hello')

    const res4 = await app.request('/files/a/b/c.txt')
    expect(res4.status).toBe(200)
    expect(await res4.text()).toBe('file:a/b/c.txt')

    const res5 = await app.request('/not-found')
    expect(res5.status).toBe(404)
  })

  it('throws an error when adding a route after the first request has been handled', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))

    const res = await app.request('/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')

    expect(() => {
      app.get('/world', (c) => c.text('world'))
    }).toThrowError(new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT))
  })
})
