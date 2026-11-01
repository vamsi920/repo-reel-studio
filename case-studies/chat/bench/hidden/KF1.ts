import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';

test('hidden: array values in searchParams objects repeat the key', async t => {
	const server = await createHttpTestServer(t);
	server.get('/', (request, response) => {
		response.end(request.url);
	});

	t.is(await ky(server.url, {searchParams: {tag: ['a', 'b'], page: 1}}).text(), '/?tag=a&tag=b&page=1');
	t.is(await ky(server.url, {searchParams: {tag: ['a', undefined, 'c']}}).text(), '/?tag=a&tag=c');
	t.is(await ky(server.url, {searchParams: {tag: [], page: 2}}).text(), '/?page=2');
	t.is(await ky(server.url, {searchParams: {n: [1, true]}}).text(), '/?n=1&n=true');
});

test('hidden: existing searchParams forms unchanged', async t => {
	const server = await createHttpTestServer(t);
	server.get('/', (request, response) => {
		response.end(request.url);
	});

	t.is(await ky(server.url, {searchParams: 'a=1&b=2'}).text(), '/?a=1&b=2');
	t.is(await ky(server.url, {searchParams: [['a', '1'], ['a', '2']]}).text(), '/?a=1&a=2');
	t.is(await ky(server.url, {searchParams: new URLSearchParams({x: 'y'})}).text(), '/?x=y');
	t.is(await ky(server.url, {searchParams: {a: 'x', b: undefined}}).text(), '/?a=x');
});
