import { Hono } from '../../hono'
import { MESSAGE_MATCHER_IS_ALREADY_BUILT } from '../../router'

describe('SmartRouter router switching', () => {
  describe('Default Hono app with ordinary routes', () => {
    it('uses RegExpRouter for ordinary routes', async () => {
      const app = new Hono()

      // Initial name should be SmartRouter
      expect(app.router.name).toBe('SmartRouter')

      // Add ordinary routes
      app.get('/hello', (c) => c.text('hello'))
      app.get('/world', (c) => c.text('world'))

      // First request triggers router selection
      app.get('/test', (c) => c.text('test'))

      // Make a request to trigger the first match
      await app.request('/hello')

      // After first match, should be using RegExpRouter
      expect(app.router.name).toBe('SmartRouter + RegExpRouter')
    })

    it('falls back to TrieRouter for routes RegExpRouter cannot handle', async () => {
      const app = new Hono()

      // Add conflicting routes that RegExpRouter cannot resolve
      // These create ambiguous patterns that throw UnsupportedPathError in RegExpRouter
      app.get('/:user/entries', (c) => c.text('user entries'))
      app.get('/entry/:name', (c) => c.text('entry name'))

      // Make a request that would fail in RegExpRouter but works in TrieRouter
      await app.request('/entry/entries')

      // After first match, should fall back to TrieRouter
      expect(app.router.name).toBe('SmartRouter + TrieRouter')
    })

    it('throws an error when adding a route after the first request', async () => {
      const app = new Hono()

      // Add a route and make a request
      app.get('/hello', (c) => c.text('hello'))
      await app.request('/hello')

      // Now try to add another route - should throw error
      expect(() => {
        app.get('/world', (c) => c.text('world'))
      }).toThrow(MESSAGE_MATCHER_IS_ALREADY_BUILT)
    })
  })
})
