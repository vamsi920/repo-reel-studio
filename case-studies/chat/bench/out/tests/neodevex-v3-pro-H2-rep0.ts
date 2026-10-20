import { Hono } from '../../hono'

describe('SmartRouter', () => {
  it('Should use RegExpRouter for ordinary routes', async () => {
    const app = new Hono()
    app.get('/user', (c) => c.text('user'))
    const res = await app.request('/user')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('user')
    expect(app.router.activeRouter.name).toBe('RegExpRouter')
  })

  it('Should fall back to TrieRouter for complex routes and handle requests correctly', async () => {
    const app = new Hono()
    app.get('/user', (c) => c.text('user'))
    // This route will force a fallback to TrieRouter
    app.get('/user/:name(hono|oha)', (c) => c.text(c.req.param('name')))

    // Make a request to determine the router
    await app.request('/') // This request is to determine the router
    
    expect(app.router.activeRouter.name).toBe('TrieRouter')

    // Test if both routes are still working
    const res1 = await app.request('/user')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toBe('user')
    
    const res2 = await app.request('/user/hono')
    expect(res2.status).toBe(200)
    expect(await res2.text()).toBe('hono')
  })

  it('Should throw an error when adding a route after the first request has been handled', async () => {
    const app = new Hono()
    app.get('/user', (c) => c.text('user'))
    await app.request('/user')
    
    try {
      app.get('/new-route', (c) => c.text('new route'))
      fail('Should have thrown an error')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toBe(
        'Can not add a route since the matcher is already built.'
      )
    }
  })
})
