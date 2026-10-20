import { getRouterName } from '../../helper/dev'
import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'

describe('SmartRouter with default Hono()', () => {
  it('uses RegExpRouter when only ordinary routes are registered', async () => {
    const app = new Hono()
    app.get('/', (c) => c.text('root'))
    app.get('/entry/:id', (c) => c.text(`entry:${c.req.param('id')}`))

    const rootRes = await app.request('/')
    expect(rootRes.status).toBe(200)
    expect(await rootRes.text()).toBe('root')

    const entryRes = await app.request('/entry/123')
    expect(entryRes.status).toBe(200)
    expect(await entryRes.text()).toBe('entry:123')

    expect(app.router.name).toBe('SmartRouter + RegExpRouter')
    expect(getRouterName(app)).toBe('SmartRouter + RegExpRouter')
  })

  it('falls back to TrieRouter and answers requests when a route unsupported by RegExpRouter is registered', async () => {
    const app = new Hono()
    app.get('/files/:name{.*}', (c) => c.text(`file:${c.req.param('name')}`))
    app.get('/:user/entries', (c) => c.text(`user:${c.req.param('user')}`))
    app.get('/entry/:name', (c) => c.text(`entry:${c.req.param('name')}`))

    const fileRes = await app.request('/files/dir/readme.md')
    expect(fileRes.status).toBe(200)
    expect(await fileRes.text()).toBe('file:dir/readme.md')

    const userRes = await app.request('/alice/entries')
    expect(userRes.status).toBe(200)
    expect(await userRes.text()).toBe('user:alice')

    const entryRes = await app.request('/entry/hello')
    expect(entryRes.status).toBe(200)
    expect(await entryRes.text()).toBe('entry:hello')

    expect(app.router.name).toBe('SmartRouter + TrieRouter')
    expect(getRouterName(app)).toBe('SmartRouter + TrieRouter')
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
    }).toThrowError(new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT))
  })
})
