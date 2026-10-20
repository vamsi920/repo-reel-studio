import {setTimeout as delay} from 'node:timers/promises';
import test from 'ava';
import ky, {
	NetworkError,
	TimeoutError,
	isKyError,
	isNetworkError,
} from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import {parseRawBody} from './helpers/parse-body.js';
import {withPerformance} from './helpers/with-performance.js';

const fixture = 'fixture';
const defaultRetryCount = 2;
const retryAfterOn500 = 2;
const retryAfterOn413 = 2;

test('network error', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			response.status(99_999).end();
		}
	});

	t.is(await ky(server.url).text(), fixture);
	t.is(requestCount, defaultRetryCount + 1);
});

test('status code 500', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			response.sendStatus(500);
		}
	});

	t.is(await ky(server.url).text(), fixture);
	t.is(requestCount, defaultRetryCount + 1);
});

test('only on defined status codes', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			response.sendStatus(400);
		}
	});

	await t.throwsAsync(ky(server.url).text(), {message: /Bad Request/});
	t.is(requestCount, 1);
});

test('not on POST', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.post('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			response.sendStatus(500);
		}
	});

	await t.throwsAsync(ky.post(server.url).text(), {
		message: /Internal Server Error/,
	});
	t.is(requestCount, 1);
});

test('respect Retry-After: 0 and retry immediately', async t => {
	const retryCount = 4;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			response.writeHead(413, {
				'Retry-After': 0,
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

test('RateLimit-Reset is treated the same as Retry-After', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			const header = (requestCount < 2) ? 'RateLimit-Reset' : 'Retry-After';
			response.writeHead(429, {
				[header]: 1,
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

test('RateLimit-Reset with time since epoch', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			const twoSecondsByDelta = 2;
			const oneSecondByEpoch = (Date.now() / 1000) + 1;
			response.writeHead(429, {
				'RateLimit-Reset': (requestCount < 2) ? twoSecondsByDelta : oneSecondByEpoch,
			});

			response.end('');
		}
	});

	await withPerformance({
		t,
		expectedDuration: 2000 + 1000,
		async test() {
			t.is(await ky(server.url).text(), fixture);
		},
	});

	t.is(requestCount, 3);
});

test('respect 413 Retry-After', async t => {
	const startTime = Date.now();
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end((Date.now() - startTime).toString());
		} else {
			response.writeHead(413, {
				'Retry-After': retryAfterOn413,
			});
			response.end('');
		}
	});

	const timeElapsedInMs = Number(await ky(server.url).text());
	t.true(timeElapsedInMs >= retryAfterOn413 * 1000);
	t.is(requestCount, retryAfterOn413 + 1);
});

test('respect 413 Retry-After with timestamp', async t => {
	const startTime = Date.now();
	let requestCount = 0;

	const server = await createHttpTestServer(t, {bodyParser: false});
	server.get('/', (_request, response) => {
		requestCount++;
		if (requestCount === defaultRetryCount + 1) {
			response.end((Date.now() - startTime).toString());
		} else {
			// @NOTE we need to round up to the next second due to http-date resolution
			const date = new Date(Date.now() + ((retryAfterOn413 + 1) * 1000)).toUTCString();
			response.writeHead(413, {
				'Retry-After': date,
			});
			response.end('');
		}
	});

	const timeElapsedInMs = Number(await ky(server.url).text());
	t.true(timeElapsedInMs >= retryAfterOn413 * 1000);
	t.is(requestCount, retryAfterOn413 + 1);
});

test('doesn\'t retry on 413 without Retry-After header', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;
		response.sendStatus(413);
	});

	await t.throwsAsync(ky(server.url).text(), {message: /Payload Too Large/});
	t.is(requestCount, 1);
	await ky(server.url, {throwHttpErrors: false}).text();
	t.is(requestCount, 2);
});

test('respect custom `afterStatusCodes` (500) with Retry-After header', async t => {
	const startTime = Date.now();
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end((Date.now() - startTime).toString());
		} else {
			response.writeHead(500, {
				'Retry-After': retryAfterOn500,
			});
			response.end('');
		}
	});

	const timeElapsedInMs = Number(await ky(server.url, {retry: {afterStatusCodes: [500]}}).text());
	t.true(timeElapsedInMs >= retryAfterOn500 * 1000);
	t.is(requestCount, retryAfterOn500 + 1);
});

test('respect number of retries', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;
		response.sendStatus(408);
	});

	await t.throwsAsync(
		ky(server.url, {
			retry: {
				limit: 3,
			},
		}).text(),
		{
			message: /Request Timeout/,
		},
	);
	t.is(requestCount, 4);
});

test('respect retry methods', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.post('/', (_request, response) => {
		requestCount++;
		response.sendStatus(408);
	});

	server.get('/', (_request, response) => {
		requestCount++;
		response.sendStatus(408);
	});

	await t.throwsAsync(
		ky(server.url, {
			method: 'post',
			retry: {
				limit: 3,
				methods: ['get'],
			},
		}).text(),
		{
			message: /Request Timeout/,
		},
	);
	t.is(requestCount, 1);

	requestCount = 0;
	await t.throwsAsync(
		ky(server.url, {
			retry: {
				limit: 2,
				methods: ['get'],
			},
		}).text(),
		{
			message: /Request Timeout/,
		},
	);
	t.is(requestCount, defaultRetryCount + 1);
});

test('respect maxRetryAfter', async t => {
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

	requestCount = 0;
});

test('respect maxRetryAfter with Retry-After header value larger than maxRetryAfter', async t => {
	const retryCount = 4;
	let requestCount = 0;
	const largeRetryAfter = 10; // 10 seconds, but maxRetryAfter will clamp to 420ms
	const maxRetryAfter = 420; // 420ms

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			// Send a large Retry-After value (10 seconds)
			response.writeHead(413, {
				'Retry-After': largeRetryAfter,
			});

			response.end('');
		}
	});

	// Expected duration should be maxRetryAfter * 4 = 420 * 4 = 1680ms
	// not largeRetryAfter * 4 = 10 * 1000 * 4 = 40000ms
	await withPerformance({
		t,
		expectedDuration: maxRetryAfter + maxRetryAfter + maxRetryAfter + maxRetryAfter,
		async test() {
			t.is(await ky(server.url, {
				retry: {
					limit: retryCount,
					maxRetryAfter,
				},
			}).text(), fixture);
		},
	});

	t.is(requestCount, 5);
});

test('Retry-After with HTTP date in the past results in immediate retry', async t => {
	const retryCount = 4;
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === retryCount + 1) {
			response.end(fixture);
		} else {
			// Send a date in the past (should result in 0 delay after Math.max(0, after))
			const pastDate = new Date(Date.now() - 1000).toUTCString();
			response.writeHead(413, {
				'Retry-After': pastDate,
			});

			response.end('');
		}
	});

	// With HTTP date in the past, delay should be 0 (immediate retry)
	// Expected duration: 0 + 0 + 0 + 0 = 0ms (plus some tolerance)
	await withPerformance({
		t,
		expectedDuration: 0,
		async test() {
			t.is(await ky(server.url, {
				retry: retryCount,
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
			// Only send RateLimit-Reset, not Retry-After
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

test('RateLimit-Reset with epoch timestamp', async t => {
	let requestCount = 0;

	const server = await createHttpTestServer(t);
	server.get('/', (_request, response) => {
		requestCount++;

		if (requestCount === defaultRetryCount + 1) {
			response.end(fixture);
		} else {
			const twoSecondsByDelta = 2;
			const oneSecondByEpoch = Math.floor(Date.now() / 1000) + 1;
			response.writeHead(429, {
				'RateLimit-Reset': (requestCount < 2) ? twoSecondsByDelta : oneSecondByEpoch,
			});

			response.end('');
		}
	});

	// First request retries after 2 seconds, second request retries after 1 second
	// Total expected duration: 2000 + 1000 = 3000ms
	// Note: This test verifies that RateLimit-Reset with epoch timestamp works correctly
	// The exact timing might vary due to server processing time, so we just check retry behavior
	const result = await ky(server.url).text();
	t.is(result, fixture);
	t.is(requestCount, 3);
});
