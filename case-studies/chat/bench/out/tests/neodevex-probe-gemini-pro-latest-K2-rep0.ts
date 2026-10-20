import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';

test('Retry-After header given as an HTTP date in the past makes ky retry immediately', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t, {bodyParser: false});
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === 2) {
			response.end(fixture);
		} else {
			const date = new Date(Date.now() - 1000000).toUTCString();
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
			t.is(await ky(server.url).text(), fixture);
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
				'Retry-After': 5, // 5 seconds = 5000ms
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 200, // Should be clamped to 200ms
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: 1,
					maxRetryAfter: 200,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, 2);
});

test('when Retry-After is missing, the RateLimit-Reset header is used instead', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === 2) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'RateLimit-Reset': 1, // 1 second = 1000ms
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
