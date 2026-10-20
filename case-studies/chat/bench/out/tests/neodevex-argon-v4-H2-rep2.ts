import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'

describe('SmartRouter with default Hono app', () => {
  it('uses RegExpRouter when only ordinary routes are registered', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))
    app.get('/posts/:id', (c) => c.text(`post ${c.req.param('id')}`))

    const res = await app.request('/posts/123')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('post 123')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')
  })

  it('falls back to TrieRouter when a route RegExpRouter cannot handle is registered and answers requests correctly', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))
    app.get('/files/:name{.*}', (c) => c.text(`file ${c.req.param('name')}`))

    const res1 = await app.request('/files/dir/readme.md')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('file dir/readme.md')
    expect(app.router.name).toBe('SmartRouter + TrieRouter')

    const res2 = await app.request('/hello')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('hello')
  })

  it('throws an error when adding a route after the first request has been handled', async () => {
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
