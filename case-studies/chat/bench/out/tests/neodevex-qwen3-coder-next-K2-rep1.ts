import {setTimeout as delay} from 'node:timers/promises';
import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';

test('Retry-After HTTP date in the past makes ky retry immediately', async t => {
	const retryCount = 3;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			// Use an HTTP date in the past (1970)
			response.writeHead(429, {
				'Retry-After': 'Thu, 01 Jan 1970 00:00:00 GMT',
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 10 + 10 + 10, // Immediate retries with minimal delay
		async test() {
			t.is(await ky(server.url, {
				retry: retryCount,
			}).text(), fixture);
		},
	});

	t.is(requestCount, retryCount + 1);
});

test('Retry-After larger than maxRetryAfter is clamped', async t => {
	const retryCount = 2;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			// Use a large Retry-After value (300 seconds = 5 minutes)
			response.writeHead(429, {
				'Retry-After': 300,
			});
			response.end('');
		}
	});

	// MaxRetryAfter is 200ms so even though Retry-After says 300s,
	// We should only wait 200ms per retry
	await withPerformance({
		t,
		expectedDuration: 200 + 200,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: retryCount,
					maxRetryAfter: 200,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, retryCount + 1);
});

test('RateLimit-Reset is used when Retry-After is missing', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === 2) {
			response.end(fixture);
		} else {
			// Only RateLimit-Reset header, no Retry-After
			response.writeHead(429, {
				'RateLimit-Reset': '1',
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 1000,
		async test() {
			t.is(await ky(server.url).text(), fixture);
		},
	});

	t.is(requestCount, 2);
});
