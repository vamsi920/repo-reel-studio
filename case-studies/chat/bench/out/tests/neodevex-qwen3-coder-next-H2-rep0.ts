import { Hono } from '../../hono'
import { RegExpRouter } from '../reg-exp-router'
import { TrieRouter } from '../trie-router'

describe('SmartRouter bench', () => {
  describe('With only ordinary routes', () => {
    it('should use RegExpRouter', async () => {
      const app = new Hono()

      // Add ordinary routes that RegExpRouter can handle
      app.get('/hello', (c) => c.text('hello'))
      app.get('/posts/:id', (c) => c.text('post'))

      // Check router name before any request
      // The router should be SmartRouter initially
      expect(app.router.name).toBe('SmartRouter')

      // Make a request to trigger router selection
      await app.request('/hello')

      // After the first request, it should have selected one of the routers
      // Since only ordinary routes were added, it should use RegExpRouter
      const smartRouter = app.router as any
      const activeRouter = smartRouter.activeRouter
      expect(activeRouter.name).toBe('RegExpRouter')
    })
  })

  describe('When a route RegExpRouter cannot handle', () => {
    it('should fall back to TrieRouter and still answer requests correctly', async () => {
      const app = new Hono()

      // Add routes that cause ambiguity in RegExpRouter
      // These will make RegExpRouter throw UnsupportedPathError
      // Pattern from reg-exp-router test: "/:user/entries" and "/entry/:name"
      app.get('/:user/entries', (c) => c.text('user entries'))
      app.get('/entry/:name', (c) => c.text('entry name'))

      // Check that SmartRouter can still handle the routes
      expect(app.router.name).toBe('SmartRouter')

      // Make a request - should fall back to TrieRouter
      await app.request('/entry/hello')

      // After the first request, it should have switched to TrieRouter
      const smartRouter = app.router as any
      const activeRouter = smartRouter.activeRouter
      expect(activeRouter.name).toBe('TrieRouter')

      // Verify the router still answers requests correctly
      const response1 = await app.request('/entry/hello')
      expect(response1.status).toBe(200)
      expect(await response1.text()).toBe('entry name')

      const response2 = await app.request('/john/entries')
      expect(response2.status).toBe(200)
      expect(await response2.text()).toBe('user entries')
    })

    it('should handle complex ambiguous routes correctly', async () => {
      const app = new Hono()

      // Add routes that cause complex ambiguity with different param names
      // Pattern from reg-exp-router test: "/:type/:id" and "/:class/:id"
      app.get('/:type/:id', (c) => c.text('type'))
      app.get('/:class/:id', (c) => c.text('class'))

      // Make a request that would cause UnsupportedPathError in plain RegExpRouter
      await app.request('/entry/123')

      // Should have fallen back to TrieRouter
      const smartRouter = app.router as any
      const activeRouter = smartRouter.activeRouter
      expect(activeRouter.name).toBe('TrieRouter')
    })
  })

  describe('Adding route after first request', () => {
    it('should throw an error', async () => {
      const app = new Hono()

      app.get('/initial', (c) => c.text('initial'))

      // Make first request to trigger router selection
      await app.request('/initial')

      // Try to add a new route - should throw an error
      expect(() => {
        app.get('/new', (c) => c.text('new'))
      }).toThrowError('Can not add a route since the matcher is already built.')
    })
  })
})
