// Startup file for cPanel "Setup Node.js App" (Passenger). Passenger replaces the port passed to listen().
// Writes boot.log next to this file so problems can be read from File Manager (no terminal needed).
const fs = require('fs'), path = require('path');
const log = m => { try { fs.appendFileSync(path.join(__dirname, 'boot.log'), new Date().toISOString() + ' ' + m + '\n'); } catch {} };
log(`app.cjs loaded; node ${process.version}; PORT=${process.env.PORT}; BASE_PATH=${process.env.BASE_PATH}; cwd=${process.cwd()}`);
process.on('uncaughtException', e => log('UNCAUGHT: ' + (e.stack || e)));
process.on('unhandledRejection', e => log('UNHANDLED: ' + ((e && e.stack) || e)));
import('./server/index.js')
  .then(({ server }) => {
    let n = 0;
    server.on('request', r => { if (n++ < 30) log(`request ${r.method} ${r.url} host=${r.headers.host}`); });
    server.listen(process.env.PORT || 3000);
    log('server.listen called');
  })
  .catch(e => { log('LOAD FAILED: ' + (e.stack || e)); process.exit(1); });
