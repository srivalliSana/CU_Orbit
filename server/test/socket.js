// Socket auth and room isolation, without needing a database.
const http = require('http');
const jwt = require('jsonwebtoken');
const { io: client } = require('socket.io-client');
process.env.CAMPUS_JWT_SECRET = 'c'; process.env.ORBIT_JWT_SECRET = 'o';
const realtime = require('../lib/realtime');

const server = http.createServer();
// alice may read room1; bob may not.
realtime.init(server, {
  canAccess: async (userId, containerId) => userId === 'alice' && containerId === 'room1',
  onPresence: () => {},
});

const tok = (sub) => jwt.sign({ sub, role: 'student' }, 'o', { algorithm: 'HS256', expiresIn: 60, audience: 'cu-orbit' });
let pass = 0, fail = 0;
const chk = (d, ok) => { ok ? (pass++, console.log('  PASS ', d)) : (fail++, console.log('  FAIL ', d)); };

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}`;
  const conn = (token) => client(url, { auth: { token }, transports: ['websocket'], reconnection: false });

  // 1. no token
  await new Promise((r) => { const s = conn(undefined); s.on('connect_error', (e) => { chk('rejects a socket with no token', e.message === 'unauthorized'); s.close(); r(); }); });

  // 2. bad signature
  await new Promise((r) => { const s = conn(jwt.sign({ sub: 'x' }, 'wrong', { audience: 'cu-orbit', expiresIn: 60 })); s.on('connect_error', (e) => { chk('rejects a forged token', e.message === 'unauthorized'); s.close(); r(); }); });

  // 3. valid connects, joins permitted room, refused elsewhere
  const alice = conn(tok('alice'));
  await new Promise((r) => alice.on('connect', r));
  chk('accepts a valid session', true);
  chk('joins a permitted room', (await new Promise((r) => alice.emit('join', 'room1', r))).ok === true);
  chk('refuses a room it cannot read', (await new Promise((r) => alice.emit('join', 'secret', r))).ok === false);

  // 4. delivery reaches a joined member
  const got = new Promise((r) => alice.on('message', r));
  realtime.toContainer('room1', 'message', { id: 'm1', text: 'hello' });
  chk('delivers to the room', (await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 1500))]))?.id === 'm1');

  // 5. a non-member never receives it
  const bob = conn(tok('bob'));
  await new Promise((r) => bob.on('connect', r));
  await new Promise((r) => bob.emit('join', 'room1', r));      // refused
  const leaked = await Promise.race([
    new Promise((r) => bob.on('message', () => r(true))),
    new Promise((r) => setTimeout(() => r(false), 800)),
  ]);
  realtime.toContainer('room1', 'message', { id: 'm2' });
  chk('does not leak to a non-member', leaked === false);

  alice.close(); bob.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
