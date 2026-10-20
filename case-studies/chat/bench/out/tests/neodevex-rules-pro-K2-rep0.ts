import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.ts';
import type {ExtendedHttpTestServer} from './helpers/create-http-test-server.ts';

test('retry-after header with past http date', async t => {
	const server = await createHttpTestServer(t);
	let requestCount = 0;
	const pastDate = new Date(Date.now() - 1000).toUTCString();
	server.get('/', (request, response) => {
		requestCount++;
		if (requestCount === 1) {
			response.writeHead(429, {'Retry-After': pastDate});
			response.end('rate-limited');
		} else {
			response.end('ok');
		}
	});

	const response = await ky(server.url).text();
	t.is(response, 'ok');
	t.is(requestCount, 2);
});

test('retry-after header clamped to maxRetryAfter', async t => {
	const server = await createHttpTestServer(t);
	let requestCount = 0;
	const largeDelay = 1000;
	const maxRetryAfter = 100;
	server.get('/', (request, response) => {
		requestCount++;
		if (requestCount === 1) {
			response.writeHead(429, {'Retry-After': String(largeDelay)});
			response.end('rate-limited');
		} else {
			response.end('ok');
		}
	});

	const startTime = Date.now();
	const response = await ky(server.url, {
		retry: {
			limit: 1,
			maxRetryAfter
		}
	}).text();
	const duration = Date.now() - startTime;

	t.is(response, 'ok');
	t.is(requestCount, 2);
	t.true(duration >= maxRetryAfter && duration < largeDelay);
});

test('ratelimit-reset header is used when retry-after is missing', async t => {
	const server = await createHttpTestServer(t);
	let requestCount = 0;
	const resetTime = Date.now() / 1000 + 0.1; // 100ms
	server.get('/', (request, response) => {
		requestCount++;
		if (requestCount === 1) {
			response.writeHead(429, {'RateLimit-Reset': String(resetTime)});
			response.end('rate-limited');
		} else {
			response.end('ok');
		}
	});

	const startTime = Date.now();
	const response = await ky(server.url, {
		retry: {
			limit: 1
		}
	}).text();
	const duration = Date.now() - startTime;

	t.is(response, 'ok');
	t.is(requestCount, 2);
	t.true(duration >= 100 && duration < 200);
});
