import { createServer } from 'node:http';
import { config } from './src/config.js';
import { runMigrations } from './src/db/migrations.js';

runMigrations();

const [{ createApp }, { createBroker }] = await Promise.all([
  import('./src/app.js'),
  import('./src/ws/broker.js'),
]);

const broker = createBroker();
const app = createApp({ broker });
const server = createServer(app);

broker.attach(server);

server.listen(config.port, config.host, () => {
  console.log(`tavern-web listening on http://${config.host}:${config.port}`);
});
