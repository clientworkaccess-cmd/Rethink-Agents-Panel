// Starts Next.js on HOST/PORT from the environment or .env (defaults 127.0.0.1:3400).
// Usage: node scripts/run.mjs dev|start
import { spawn } from "node:child_process";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: rely on the real environment
}

const mode = process.argv[2] === "dev" ? "dev" : "start";
const host = process.env.HOST || "127.0.0.1";
const port = process.env.PORT || "3400";
const next = "node_modules/next/dist/bin/next";

spawn(process.execPath, [next, mode, "-H", host, "-p", port], { stdio: "inherit" }).on(
  "exit",
  (code) => process.exit(code ?? 0),
);
