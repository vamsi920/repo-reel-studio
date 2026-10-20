import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';

test('Retry-After header given as an HTTP date in the past makes ky retry immediately', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === 2) {
			response.end(fixture);
		} else {
			// A date in the past
			const date = new Date(Date.now() - 100000).toUTCString();
			response.writeHead(429, {
				'Retry-After': date,
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
					limit: 1,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, 2);
});

test('Retry-After value larger than maxRetryAfter is clamped to maxRetryAfter', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === 2) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'Retry-After': 5, // 5000 ms
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 400,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: 1,
					maxRetryAfter: 400,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, 2);
});

test('when Retry-After is missing, RateLimit-Reset is used instead', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === 2) {
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
		expectedDuration: 1000,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: 1,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, 2);
});
