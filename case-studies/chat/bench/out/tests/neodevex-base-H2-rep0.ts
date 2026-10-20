
import { Hono } from '../../hono'
import { describe, it, expect } from 'vitest'
import { RegExpRouter } from '../../router/reg-exp-router'
import { TrieRouter } from '../../router/trie-router'
import { SmartRouter } from '../../router/smart-router'

describe('Smart Router Benchmarks', () => {
  it('should use RegExpRouter with ordinary routes', async () => {
    const app = new Hono({ router: new RegExpRouter() })
    app.get('/hello', (c) => c.text('Hello'))
    expect(app.router.name).toBe('RegExpRouter')
  })

  it('should fall back to TrieRouter with a complex route and still handle requests correctly', async () => {
    const app = new Hono({
      router: new SmartRouter({
        routers: [new RegExpRouter(), new TrieRouter()]
      })
    })
    app.get('/posts/:id{[0-9]+}', (c) => c.text(`Post ${c.req.param('id')}`))
    app.get('/hello', (c) => c.text('Hello'))

    expect(app.router.name).toBe('SmartRouter')

    let res = await app.request('/posts/123')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Post 123')

    res = await app.request('/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello')
  })

  it('should throw an error when adding a route after the first request', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('Hello'))

    await app.request('/hello')

    expect(() => {
      app.get('/new', (c) => c.text('New'))
    }).toThrow('Can not add a route since the matcher is already built.')
  })
})
