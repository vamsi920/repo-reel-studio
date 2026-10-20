import test from 'ava';
import {setTimeout} from 'node:timers/promises';
import {createHttpTestServer} from './helpers/create-http-test-server.js';
import ky from '../source/index.js';

test('a Retry-After header given as an HTTP date in the past makes ky retry immediately', async t => {
	const server = await createHttpTestServer();
	server.get('/', (_request, response) => {
		response.setHeader('Retry-After', 'Fri, 31 Dec 1999 23:59:59 GMT');
		response.statusCode = 503;
		response.end('503 Service Unavailable');
	});

	const error = await t.throwsAsync(ky(server.url, {retry: {limit: 1}}));
	t.deepEqual(error?.response?.status, 503);

	await server.close();
});

test('a Retry-After value larger than retry.maxRetryAfter is clamped to maxRetryAfter', async t => {
	const server = await createHttpTestServer();
	let requestCount = 0;
	server.get('/', (_request, response) => {
		requestCount++;
		if (requestCount === 1) {
			response.setHeader('Retry-After', '1000'); // 1000 seconds
			response.statusCode = 503;
			response.end('503 Service Unavailable');
		} else {
			response.statusCode = 200;
			response.end('OK');
		}
	});

	const startTime = Date.now();
	const maxRetryAfter = 0.5; // 500ms for testing
	await ky(server.url, {
		retry: {limit: 1, maxRetryAfter},
	});
	const endTime = Date.now();

	const duration = (endTime - startTime) / 1000;
	t.true(duration >= maxRetryAfter && duration < maxRetryAfter + 0.3); // Allowing for some overhead

	await server.close();
});

test('when Retry-After is missing, the RateLimit-Reset header is used instead', async t => {
	const server = await createHttpTestServer();
	server.get('/', (_request, response) => {
		response.setHeader('RateLimit-Reset', String(Date.now() / 1000 + 0.1)); // Reset in 0.1 seconds
		response.statusCode = 429;
		response.end('429 Too Many Requests');
	});

	const startTime = Date.now();
	const error = await t.throwsAsync(ky(server.url, {retry: {limit: 1}}));
	const endTime = Date.now();

	t.deepEqual(error?.response?.status, 429);
	const duration = (endTime - startTime) / 1000;
	t.true(duration >= 0.1 && duration < 0.2); // Check if delay was around 0.1 seconds

	await server.close();
});
