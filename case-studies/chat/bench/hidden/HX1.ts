import { Hono } from './hono'

describe('c.req.query() returns the first value of a repeated key', () => {
  const app = new Hono()
  app.get('/s', (c) => c.json({ all: c.req.query(), q: c.req.query('q'), qs: c.req.queries('q') }))

  it('percent-encoded', async () => {
    const res = await app.request('/s?q=a%20b&q=c&x=1')
    expect(await res.json()).toEqual({ all: { q: 'a b', x: '1' }, q: 'a b', qs: ['a b', 'c'] })
  })

  it('plus-encoded', async () => {
    const res = await app.request('/s?q=a+b&q=c')
    expect((await res.json()).all).toEqual({ q: 'a b' })
  })

  it('unencoded', async () => {
    const res = await app.request('/s?q=a&q=c')
    expect((await res.json()).all).toEqual({ q: 'a' })
  })

  it('encoded key', async () => {
    const res = await app.request('/s?k%20y=1&k%20y=2')
    expect((await res.json()).all).toEqual({ 'k y': '1' })
  })
})
