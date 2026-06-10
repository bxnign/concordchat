import 'dotenv/config';
import Fastify from 'fastify';

const server = Fastify({ logger: true });
const PORT = Number(process.env.PORT) || 3000;

server.get('/health', async (_request, _reply) => {
  return { status: 'ok' };
});

server.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});
