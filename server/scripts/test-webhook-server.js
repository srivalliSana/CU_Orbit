/**
 * A throwaway local "third-party app" webhook for manually verifying the
 * slash-command dispatch flow — stands in for a real app's backend so you
 * don't need any external service or URL. Prints every request it receives
 * and replies with a fixed JSON response.
 *
 * Usage:
 *   node scripts/test-webhook-server.js [port]   (default port 4001)
 *
 * Then register the test app pointing at it:
 *   node scripts/register-test-app.js http://localhost:4001/callback http://localhost:4001/webhook
 */

const http = require('http');

const port = Number(process.argv[2]) || 4001;

const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
        console.log(`\n[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
        console.log('  signature header:', req.headers['x-cu-orbit-signature'] || '(none)');
        console.log('  body:', body);

        if (req.url === '/webhook') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ text: 'hello from the test app 👋' }));
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('ok');
        }
    });
});

server.listen(port, () => {
    console.log(`Test webhook listening on http://localhost:${port}`);
    console.log(`  webhook_url for register-test-app.js: http://localhost:${port}/webhook`);
    console.log('Leave this running, then trigger it by typing /testcmd in a channel.\n');
});
