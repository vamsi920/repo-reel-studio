import test from 'ava';
import ky from '../source/index.js';
import nock from 'nock';

const instance = ky.create({
	prefix: 'https://example.com',
	retry: {
		limit: 2,
		methods: ['get'],
		statusCodes: [429],
	},
});

test('Retry-After header with an HTTP date in the past retries immediately', async t => {
	const scope = nock('https://example.com')
		.get('/test')
		.reply(429, '', {'Retry-After': new Date(Date.now() - 1000).toUTCString()})
		.get('/test')
		.reply(200, 'OK');

	const response = await instance.get('test');
	t.is(response.status, 200);
	t.true(scope.isDone());
});

test('Retry-After header larger than maxRetryAfter is clamped', async t => {
	const maxRetryAfter = 1000;
	const scope = nock('https://example.com')
		.get('/test')
		.reply(429, '', {'Retry-After': String((maxRetryAfter + 5000) / 1000)})
		.get('/test')
		.reply(200, 'OK');

	const requestTime = Date.now();
	const response = await instance.get('test', {retry: {maxRetryAfter}});
	const responseTime = Date.now();

	t.is(response.status, 200);
	t.true(responseTime - requestTime < maxRetryAfter + 500);
	t.true(scope.isDone());
});

test('RateLimit-Reset header is used if Retry-After is missing', async t => {
	const resetTime = Date.now() + 500;
	const scope = nock('https://example.com')
		.get('/test')
		.reply(429, '', {'RateLimit-Reset': String(Math.round(resetTime / 1000))})
		.get('/test')
		.reply(200, 'OK');

	const requestTime = Date.now();
	const response = await instance.get('test');
	const responseTime = Date.now();

	t.is(response.status, 200);
	t.true(responseTime - requestTime >= 500);
	t.true(scope.isDone());
});
