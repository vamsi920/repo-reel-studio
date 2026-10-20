import {setTimeout as delay} from 'node:timers/promises';
import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';
const defaultRetryCount = 2;

test('Retry-After header given as an HTTP date in the past makes ky retry immediately', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			// Set Retry-After to a date in the past (e.g., 1 second ago)
			const pastDate = new Date(Date.now() - 1000).toUTCString();
			response.writeHead(429, {
				'Retry-After': pastDate,
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 0, // Expect immediate retry
		async test() {
			t.is(await ky(server.url).text(), fixture);
		},
	});

	t.is(requestCount, defaultRetryCount + 1);
});

test('Retry-After value larger than retry.maxRetryAfter is clamped to maxRetryAfter', async t => {
	const maxRetryAfter = 2000; // 2 seconds
	const retryAfterHeader = 10; // 10 seconds, larger than maxRetryAfter
	const retryCount = 1;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'Retry-After': retryAfterHeader,
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: maxRetryAfter,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: retryCount,
					maxRetryAfter: maxRetryAfter,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, retryCount + 1);
});

test('When Retry-After is missing, RateLimit-Reset header is used instead', async t => {
	const rateLimitReset = 2; // 2 seconds
	const retryCount = 1;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'RateLimit-Reset': rateLimitReset,
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: rateLimitReset * 1000,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: retryCount,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, retryCount + 1);
});
