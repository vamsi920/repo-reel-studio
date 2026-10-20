
import { Hono } from '../../hono'
import { bench, describe, expect, it } from 'vitest'

describe('SmartRouter', () => {
  it('Should use RegExpRouter', async () => {
    const app = new Hono()
    app.get('/user/john', () => new Response('john'))
    await app.request('/user/john')
    expect(app.router.name).toBe('SmartRouter + RegExpRouter')
  })

  it('Should fallback to TrieRouter', async () => {
    const app = new Hono()
    app.get('/user/john', () => new Response('john'))
    app.get('/user/:name', () => new Response('Hello'))
    // Fallback to TrieRouter
    app.get('/user/:name{[a-z]+}', () => new Response('Trie'))
        await app.request('/user/john')
    expect(app.router.name).toBe('SmartRouter + TrieRouter')

    let res = await app.request('/user/john')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('john')

    res = await app.request('/user/jane')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello')

    res = await app.request('/user/jane')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Trie')
  })

  it('Should throw an error when adding a route after the first request', async () => {
    const app = new Hono()
    app.get('/user/john', () => new Response('john'))
    await app.request('/user/john')
    expect(() => app.get('/user/jane', () => new Response('jane'))).toThrowError(
      'Can not add a route since the matcher is already built.'
    )
  })
})
