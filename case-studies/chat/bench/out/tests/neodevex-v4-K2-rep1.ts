import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';
const defaultRetryCount = 2;

test('a Retry-After header given as an HTTP date in the past makes ky retry immediately', async t => {
	const server = await createHttpTestServer(t);
	let requestCount = 0;

	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			const pastDate = new Date(Date.now() - 1000).toUTCString();
			response.writeHead(503, {
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
	const server = await createHttpTestServer(t);
	let requestCount = 0;
	const maxRetryAfter = 0.5; // 500ms
	const longRetryAfter = 5; // 5 seconds, should be clamped

	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(503, {
				'Retry-After': longRetryAfter,
			});
			response.end('');
		}
	});

	await withPerformance({
		t,
		// Expected duration should be (defaultRetryCount * maxRetryAfter) * 1000ms
		expectedDuration: defaultRetryCount * maxRetryAfter * 1000,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					maxRetryAfter: maxRetryAfter * 1000, // Ky expects milliseconds
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, defaultRetryCount + 1);
});

test('when Retry-After is missing, the RateLimit-Reset header is used instead', async t => {
	const server = await createHttpTestServer(t);
	let requestCount = 0;
	const rateLimitReset = 1; // 1 second

	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(429, {
				'RateLimit-Reset': (Date.now() / 1000) + rateLimitReset, // Unix timestamp in seconds
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
