import { Hono } from '../../hono'
import { cors } from '.'

const PNA_REQ = 'Access-Control-Request-Private-Network'
const PNA_RES = 'Access-Control-Allow-Private-Network'

describe('CORS allowPrivateNetwork', () => {
  const app = new Hono()
  app.use('/on/*', cors({ origin: 'http://example.com', allowPrivateNetwork: true }))
  app.use('/off/*', cors({ origin: 'http://example.com' }))
  app.get('/on/x', (c) => c.text('ok'))
  app.get('/off/x', (c) => c.text('ok'))

  const preflight = (path: string, pna: boolean) =>
    app.request(path, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'GET',
        ...(pna ? { [PNA_REQ]: 'true' } : {}),
      },
    })

  it('allows private network on preflight when enabled and requested', async () => {
    const res = await preflight('/on/x', true)
    expect(res.status).toBe(204)
    expect(res.headers.get(PNA_RES)).toBe('true')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://example.com')
  })

  it('omits the header when not requested', async () => {
    const res = await preflight('/on/x', false)
    expect(res.headers.get(PNA_RES)).toBeNull()
  })

  it('omits the header when the option is off', async () => {
    const res = await preflight('/off/x', true)
    expect(res.headers.get(PNA_RES)).toBeNull()
  })

  it('omits the header on non-preflight requests', async () => {
    const res = await app.request('/on/x', {
      headers: { Origin: 'http://example.com', [PNA_REQ]: 'true' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get(PNA_RES)).toBeNull()
  })
})
