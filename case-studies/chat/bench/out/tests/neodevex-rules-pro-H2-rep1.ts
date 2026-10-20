import { Hono } from '../../hono'
import { bench, describe, expect, it } from 'vitest'

describe('SmartRouter', () => {
  it('Should use RegExpRouter', () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))
    // @ts-expect-error
    expect(app.router.name).toBe('SmartRouter')
  })

  it('Should use TrieRouter', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))
    app.get('/hello/:name', (c) => c.text('hello'))
    app.get('/:name/foo', (c) => c.text('hello'))

    let res = await app.request('/hello')
    expect(res.status).toBe(200)
    // @ts-expect-error
    expect(app.router.activeRouter.name).toBe('TrieRouter')

    res = await app.request('/hello')
    expect(res.status).toBe(200)
    // @ts-expect-error
    expect(app.router.activeRouter.name).toBe('TrieRouter')
  })

  it('Should throw an error when adding a route after the first request has been handled', async () => {
    const app = new Hono()
    app.get('/hello', (c) => c.text('hello'))
    await app.request('/hello')
    expect(() => app.get('/world', (c) => c.text('world'))).toThrowError(
      'Can not add a route since the matcher is already built.'
    )
  })
})
