import test from 'ava';
import sinon from 'sinon';
import {setTimeout} from 'node:timers/promises';
import ky from '../source/index.js';
import {HTTPError} from '../source/errors/index.js';

const fixture = 'https://example.com';

test.beforeEach(t => {
	t.context.sandbox = sinon.createSandbox();
	t.context.clock = t.context.sandbox.useFakeTimers();
});

test.afterEach(t => {
	t.context.sandbox.restore();
});

test('a Retry-After header given as an HTTP date in the past makes ky retry immediately', async t => {
	const stub = sinon.stub()
		.onFirstCall().returns(new Response(null, {
			status: 429,
			headers: {
				'Retry-After': 'Mon, 01 Jan 2000 00:00:00 GMT', // Date in the past
			},
		}))
		.onSecondCall().returns(new Response('OK'));

	await ky(fixture, {fetch: stub});
	t.true(stub.calledTwice);
	t.is(stub.callCount, 2);
});

test('a Retry-After value larger than retry.maxRetryAfter is clamped to maxRetryAfter', async t => {
	const stub = sinon.stub()
		.onFirstCall().returns(new Response(null, {
			status: 429,
			headers: {
				'Retry-After': '100', // 100 seconds
			},
		}))
		.onSecondCall().returns(new Response('OK'));

	const maxRetryAfter = 0.05; // 50ms
	const start = Date.now();
	await ky(fixture, {
		fetch: stub,
		retry: {
			maxRetryAfter,
			methods: ['get'],
			limit: 1,
		},
	});
	const end = Date.now();
	const duration = end - start;

	// It should wait for approximately maxRetryAfter (50ms)
	t.true(duration >= maxRetryAfter * 1000);
	t.true(duration < 100 * 1000);
});

test('when Retry-After is missing, the RateLimit-Reset header is used instead', async t => {
	const stub = sinon.stub()
		.onFirstCall().returns(new Response(null, {
			status: 429,
			headers: {
				'RateLimit-Reset': String(Math.floor((Date.now() + 500) / 1000)), // Reset in 0.5 seconds
			},
		}))
		.onSecondCall().returns(new Response('OK'));

	const start = Date.now();
	await ky(fixture, {
		fetch: stub,
		retry: {
			methods: ['get'],
			limit: 1,
		},
	});
	const end = Date.now();
	const duration = end - start;

	// It should wait for approximately 0.5 seconds
	t.true(duration >= 500);
	t.true(duration < 700);
});
