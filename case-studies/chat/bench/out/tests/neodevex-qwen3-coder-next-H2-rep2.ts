/* eslint-disable @typescript-eslint/no-unused-vars */
import { Hono } from '../../hono'
import type { Context } from '../../context'

describe('SmartRouter default behavior tests', () => {
  describe('Default Hono() app router', () => {
    it('should use RegExpRouter for ordinary routes', async () => {
      const app = new Hono()

      // Before first request, router name should be SmartRouter
      expect(app.router.name).toBe('SmartRouter')

      // Add ordinary routes (which RegExpRouter can handle)
      app.get('/hello', (c: Context) => c.text('hello'))
      app.get('/users/:id', (c: Context) => c.text('user'))

      // First request should trigger router switch
      await app.request('/hello')

      // After first request, should have switched to SmartRouter + RegExpRouter
      expect(app.router.name).toBe('SmartRouter + RegExpRouter')
    })

    it('should fall back to TrieRouter when RegExpRouter cannot handle the route', async () => {
      const app = new Hono()

      // Add a route that RegExpRouter cannot handle (ambiguous routes)
      app.get('/entry/:id', (c: Context) => c.text('entry'))
      app.get('/entry/:action', (c: Context) => c.text('action'))

      // First request will try RegExpRouter, which will throw UnsupportedPathError
      // Then it should fall back to TrieRouter
      const response = await app.request('/entry/123')

      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).toBe('entry')

      // After fallback, router name should show TrieRouter
      expect(app.router.name).toBe('SmartRouter + TrieRouter')
    })

    it('should throw error when adding route after first request has been handled', async () => {
      const app = new Hono()

      // Add initial route
      app.get('/hello', (c: Context) => c.text('hello'))

      // First request
      await app.request('/hello')

      // Router should have switched to active router
      expect(app.router.name).toBe('SmartRouter + RegExpRouter')

      // Try to add a new route - should throw error
      expect(() => {
        app.get('/world', (c: Context) => c.text('world'))
      }).toThrow('Can not add a route since the matcher is already built.')
    })
  })
})
