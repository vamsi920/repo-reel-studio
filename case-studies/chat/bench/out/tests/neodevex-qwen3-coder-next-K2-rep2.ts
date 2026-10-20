import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';
const defaultRetryCount = 2;

test('Retry-After HTTP date in the past makes ky retry immediately', async t => {
	const retryCount = 4;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			// HTTP date in the past (1 second ago)
			const pastDate = new Date(Date.now() - 1000).toUTCString();
			response.writeHead(413, {
				'Retry-After': pastDate,
			});

			response.end('');
		}
	});

	// When Retry-After is in the past, it should be treated as 0 (immediate retry)
	await withPerformance({
		t,
		expectedDuration: 0 + 0 + 0 + 0,
		async test() {
			t.is(await ky(server.url, {
				retry: retryCount,
			}).text(), fixture);
		},
	});

	t.is(requestCount, 5);
});

test('Retry-After larger than maxRetryAfter is clamped to maxRetryAfter', async t => {
	const retryCount = 4;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			// Retry-After is 10 seconds, but maxRetryAfter is 420ms
			response.writeHead(413, {
				'Retry-After': 10,
			});

			response.end('');
		}
	});

	// The delay should be clamped to 420ms per retry, not 10 seconds
	await withPerformance({
		t,
		expectedDuration: 420 + 420 + 420 + 420,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: retryCount,
					maxRetryAfter: 420,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, 5);
});

test('RateLimit-Reset is used when Retry-After is missing', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			// Only RateLimit-Reset, no Retry-After
			// Using value of 1 second (not epoch timestamp, just number)
			response.writeHead(429, {
				'RateLimit-Reset': 1,
			});

			response.end('');
		}
	});

	// Should use RateLimit-Reset as fallback
	// With 2 retries at 1 second each, total is ~2000ms
	// Allow for some tolerance in timing
	await withPerformance({
		t,
		expectedDuration: 1000 + 1000,
		async test() {
			t.is(await ky(server.url).text(), fixture);
		},
	});

	t.is(requestCount, 3);
});
