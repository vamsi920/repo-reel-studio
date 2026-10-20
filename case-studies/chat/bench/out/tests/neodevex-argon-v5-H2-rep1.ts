import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'

describe('Default Hono() router selection with SmartRouter', () => {
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
  })

  it('falls back to TrieRouter when a route RegExpRouter cannot handle is registered and answers requests correctly', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))
    app.get('/files/:name{.*}', (c) => c.text(`file:${c.req.param('name')}`))

    expect(app.router.name).toBe('SmartRouter')

    const res1 = await app.request('/hello')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('hello')
    expect(app.router.name).toBe('SmartRouter + TrieRouter')

    const res2 = await app.request('/files/dir/readme.md')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('file:dir/readme.md')
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
