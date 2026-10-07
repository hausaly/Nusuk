// Startup file for cPanel "Setup Node.js App" (Passenger). Passenger replaces the port passed to listen().
import('./server/index.js').then(({ server }) => server.listen(process.env.PORT || 3000)).catch(e => { console.error(e); process.exit(1); });
