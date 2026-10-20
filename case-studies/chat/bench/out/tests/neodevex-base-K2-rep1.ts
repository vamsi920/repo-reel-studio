import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';
const defaultRetryCount = 2;

test('Retry-After header given as an HTTP date in the past makes ky retry immediately', async t => {
	const retryCount = 2;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			// A date in the past
			const pastDate = new Date(Date.now() - 60_000).toUTCString();
			response.writeHead(429, {
				'Retry-After': pastDate,
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		// We expect the retries to happen immediately, so the total duration should be very small
		expectedDuration: 0,
		async test() {
			t.is(await ky(server.url, {retry: retryCount}).text(), fixture);
		},
	});

	t.is(requestCount, retryCount + 1);
});

test('Retry-After value larger than retry.maxRetryAfter is clamped to maxRetryAfter', async t => {
	const retryCount = 1;
	let requestCount = 0;
	const maxRetryAfter = 500; // milliseconds

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			// A value much larger than maxRetryAfter
			response.writeHead(429, {
				'Retry-After': 10, // seconds
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		// Expected duration should be around maxRetryAfter because it's clamped
		expectedDuration: maxRetryAfter,
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

test('When Retry-After is missing, the RateLimit-Reset header is used instead', async t => {
	const retryCount = 1;
	let requestCount = 0;
	const rateLimitResetTime = 1; // second

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			// Missing Retry-After, provide RateLimit-Reset
			response.writeHead(429, {
				'RateLimit-Reset': rateLimitResetTime,
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		// Expected duration should be around rateLimitResetTime
		expectedDuration: rateLimitResetTime * 1000,
		async test() {
			t.is(await ky(server.url, {retry: retryCount}).text(), fixture);
		},
	});

	t.is(requestCount, retryCount + 1);
});
