import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';
const defaultRetryCount = 2;

test('Retry-After as HTTP date in the past retries immediately', async t => {
	const retryCount = 4;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(413, {
				'Retry-After': new Date(Date.now() - 10_000).toUTCString(),
			});

			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 4 + 4 + 4 + 4,
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
			response.writeHead(413, {
				'Retry-After': 1,
			});

			response.end('');
		}
	});

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
			response.writeHead(429, {
				'RateLimit-Reset': 1,
			});

			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 1000 + 1000,
		async test() {
			t.is(await ky(server.url).text(), fixture);
		},
	});

	t.is(requestCount, 3);
});
