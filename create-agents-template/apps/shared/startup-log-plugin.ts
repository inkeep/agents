interface Server {
  httpServer: null | {
    address: () => null | string | { port: number };
    once: (
      event: "listening" | "close" | "timeout",
      callback: () => void
    ) => void;
  };
}

export const startupLogPlugin = () => ({
  name: "custom-startup-logs",
  configureServer(server: Server) {
    server.httpServer?.once("listening", () => {
      const address = server.httpServer?.address();
      if (typeof address === "object" && address) {
        const port = address.port;
        const host: string = "http://localhost:";

        const green = "\x1b[32m";
        const bold = "\x1b[1m";
        const cyan = "\x1b[36m";
        const reset = "\x1b[0m";

        setTimeout(() => {
          console.log("");
          console.log(
            `  ${green}➜${reset}  ${bold}Management API:${reset} ${cyan}${host}${port}${reset}`
          );
          console.log(
            `  ${green}➜${reset}  ${bold}OpenAPI documentation:${reset} ${cyan}${host}${port}/openapi.json${reset}`
          );
          console.log("");
        }, 0);
      }
    });
  },
});
