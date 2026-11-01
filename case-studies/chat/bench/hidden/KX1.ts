import test from 'ava';
import ky from '../source/index.js';
import {createHttpTestServer} from './helpers/create-http-test-server.js';

test('hidden: falsy searchParams values are sent, undefined is skipped', async t => {
	const server = await createHttpTestServer(t);
	server.get('/', (request, response) => {
		response.end(request.url);
	});

	t.is(
		await ky(server.url, {searchParams: {page: 0, active: false, q: '', gone: undefined, n: null as unknown as string}}).text(),
		'/?page=0&active=false&q=&n=null',
	);
	t.is(await ky(server.url, {searchParams: {cats: 'meow'}}).text(), '/?cats=meow');
});
