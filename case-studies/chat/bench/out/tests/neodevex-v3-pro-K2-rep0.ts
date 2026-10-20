import {setTimeout} from 'node:timers/promises';
import http from 'node:http';
import test from 'ava';
import ky from '../source/index.js';
import {createTestServer} from './helpers/create-test-server.js';

const server = await createTestServer();

test.after.always(() => {
	server.close();
});

test('retry with Retry-After header as a date in the past', async t => {
	let requestCount = 0;

	server.get('/retry-after-date', (_request, response) => {
		requestCount++;
		if (requestCount === 1) {
			const retryAfterDate = new Date(Date.now() - 1000).toUTCString();
			response.writeHead(429, {'Retry-After': retryAfterDate});
			response.end();
		} else {
			response.end('ok');
		}
	});

	const response = await ky.get(`${server.url}/retry-after-date`, {
		retry: {
			limit: 1,
			statusCodes: [429],
		},
	});
	const text = await response.text();
	t.is(text, 'ok');
	t.is(requestCount, 2);
});

test('retry with Retry-After header larger than maxRetryAfter', async t => {
	let requestCount = 0;
	let delay = 0;

	server.get('/retry-after-large', (_request, response) => {
		requestCount++;
		if (requestCount === 1) {
			response.writeHead(429, {'Retry-After': '1000'});
			response.end();
		} else {
			response.end('ok');
		}
	});

	const started = Date.now();
	const response = await ky.get(`${server.url}/retry-after-large`, {
		hooks: {
			beforeRetry: [
				async () => {
					delay = Date.now() - started;
				},
			],
		},
		retry: {
			limit: 1,
			statusCodes: [429],
			maxRetryAfter: 50,
		},
	});
	const text = await response.text();
	t.is(text, 'ok');
	t.is(requestCount, 2);
	t.true(delay < 100);
});

test('retry with RateLimit-Reset header when Retry-After is missing', async t => {
	let requestCount = 0;

	const resetTime = Math.round((Date.now() + 50) / 1000);

	server.get('/ratelimit-reset', (_request, response) => {
		requestCount++;
		if (requestCount === 1) {
			response.writeHead(429, {'RateLimit-Reset': resetTime.toString()});
			response.end();
		} else {
			response.end('ok');
		}
	});

	const response = await ky.get(`${server.url}/ratelimit-reset`, {
		retry: {
			limit: 1,
			statusCodes: [429],
		},
	});
	const text = await response.text();
	t.is(text, 'ok');
	t.is(requestCount, 2);
});
