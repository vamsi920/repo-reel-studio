import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';
const defaultRetryCount = 2;

test('a Retry-After header given as an HTTP date in the past makes ky retry immediately', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			const pastDate = new Date(Date.now() - 1000).toUTCString();
			response.writeHead(429, {
				'Retry-After': pastDate,
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 0, // Should retry immediately
		async test() {
			t.is(await ky(server.url).text(), fixture);
		},
	});

	t.is(requestCount, defaultRetryCount + 1);
});

test('a Retry-After value larger than retry.maxRetryAfter is clamped to maxRetryAfter', async t => {
	const maxRetryAfter = 500; // Milliseconds
	const excessiveRetryAfter = 10; // Seconds, which is 10000ms
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'Retry-After': excessiveRetryAfter,
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		// Expected duration is (defaultRetryCount * maxRetryAfter)
		expectedDuration: defaultRetryCount * maxRetryAfter,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					maxRetryAfter,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, defaultRetryCount + 1);
});

test('when Retry-After is missing, the RateLimit-Reset header is used instead', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			// First request: No Retry-After, use RateLimit-Reset
			// Second request: Has Retry-After
			const headerValue = (requestCount === 1) ? (Date.now() / 1000) + 1 : 1; // 1 second in the future for RateLimit-Reset, 1 second for Retry-After
			const headers: Record<string, string | number> = {};
			if (requestCount === 1) {
				headers['RateLimit-Reset'] = headerValue;
			} else {
				headers['Retry-After'] = headerValue;
			}

			response.writeHead(429, headers);
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 1000 + 1000, // 1 second for each retry
		async test() {
			t.is(await ky(server.url).text(), fixture);
		},
	});

	t.is(requestCount, defaultRetryCount + 1);
});
