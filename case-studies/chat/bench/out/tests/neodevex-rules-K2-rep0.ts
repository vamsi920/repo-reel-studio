import {setTimeout as delay} from 'node:timers/promises';
import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';
const defaultRetryCount = 2;

// Test case 1: a Retry-After header given as an HTTP date in the past makes ky retry immediately
test('Retry-After header in the past makes ky retry immediately', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			const pastDate = new Date(Date.now() - 1000).toUTCString(); // 1 second in the past
			response.writeHead(429, {
				'Retry-After': pastDate,
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 0, // Should retry immediately, so duration should be minimal
		async test() {
			t.is(await ky(server.url).text(), fixture);
		},
	});

	t.is(requestCount, defaultRetryCount + 1);
});

// Test case 2: a Retry-After value larger than retry.maxRetryAfter is clamped to maxRetryAfter
test('Retry-After value larger than maxRetryAfter is clamped', async t => {
	const maxRetryAfter = 500; // milliseconds
	const retryAfterHeader = 5; // seconds, which is 5000ms, larger than maxRetryAfter
	const expectedDelay = maxRetryAfter; // should be clamped to maxRetryAfter

	let requestCount = 0;
	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'Retry-After': retryAfterHeader,
			});
			response.end('');
		}
	});

	const startTime = Date.now();
	await ky(server.url, {
		retry: {
			maxRetryAfter,
		},
	}).text();
	const endTime = Date.now();

	const totalDelay = endTime - startTime;
	// We expect the total delay to be at least (defaultRetryCount * expectedDelay)
	// and less than (defaultRetryCount * retryAfterHeader * 1000)
	t.true(totalDelay >= (defaultRetryCount * expectedDelay));
	t.true(totalDelay < (defaultRetryCount * retryAfterHeader * 1000));
	t.is(requestCount, defaultRetryCount + 1);
});

// Test case 3: when Retry-After is missing, the RateLimit-Reset header is used instead
test('RateLimit-Reset header is used when Retry-After is missing', async t => {
	let requestCount = 0;
	const rateLimitReset = 1; // seconds

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'RateLimit-Reset': rateLimitReset, // Retry-After is missing
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: defaultRetryCount * rateLimitReset * 1000,
		async test() {
			t.is(await ky(server.url).text(), fixture);
		},
	});

	t.is(requestCount, defaultRetryCount + 1);
});
