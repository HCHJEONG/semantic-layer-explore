import { createServer, type Server } from "node:http";

export class HealthServer {
  private server: Server | undefined;
  private ready = false;

  constructor(private readonly port: number) {}

  async start() {
    this.server = createServer((request, response) => {
      const live = request.url === "/health";
      const ready = request.url === "/ready" && this.ready;
      response.writeHead(live || ready ? 200 : request.url === "/ready" ? 503 : 404, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: live ? "ok" : ready ? "ready" : request.url === "/ready" ? "not-ready" : "not-found" }));
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(this.port, "0.0.0.0", resolve);
    });
  }

  markReady() { this.ready = true; }
  markNotReady() { this.ready = false; }

  async stop() {
    this.markNotReady();
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => this.server?.close((error) => error ? reject(error) : resolve()));
  }
}
