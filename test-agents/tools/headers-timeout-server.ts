import net from 'net';

const PORT = 19876;
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '5000', 10);

const server = net.createServer((socket) => {
  console.log(
    `[headers-timeout-server] Client connected from ${socket.remoteAddress}:${socket.remotePort}`
  );

  if (TIMEOUT_MS > 0) {
    setTimeout(() => {
      console.log(
        `[headers-timeout-server] Closing socket for ${socket.remoteAddress}:${socket.remotePort}`
      );
      socket.end();
    }, TIMEOUT_MS);
  }
});

server.listen(PORT, () => {
  console.log(
    `[headers-timeout-server] Listening on http://localhost:${PORT} — accepts connections but never responds`
  );
  console.log(`[headers-timeout-server] Socket close timeout: ${TIMEOUT_MS}ms`);
});
