import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';
const retryCount = 2;
const fallbackDelay = 2000;

test('Retry-After as an HTTP date in the past retries immediately', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'Retry-After': new Date(Date.now() - 60_000).toUTCString(),
			});

			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 0,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: retryCount,
					// Would be used if the past date were not honored
					delay: () => fallbackDelay,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, retryCount + 1);
});

test('Retry-After larger than maxRetryAfter is clamped to maxRetryAfter', async t => {
	const maxRetryAfter = 500;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'Retry-After': 10,
			});

			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: maxRetryAfter * retryCount,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: retryCount,
					maxRetryAfter,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, retryCount + 1);
});

test('RateLimit-Reset is used when Retry-After is missing', async t => {
	const rateLimitResetSeconds = 1;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'RateLimit-Reset': rateLimitResetSeconds,
			});

			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: rateLimitResetSeconds * 1000 * retryCount,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: retryCount,
					// Would be used if RateLimit-Reset were ignored
					delay: () => fallbackDelay,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, retryCount + 1);
});
