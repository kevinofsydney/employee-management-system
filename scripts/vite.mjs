import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const configHome = path.join(root, ".wrangler-config");
await mkdir(configHome, { recursive: true });
const mode = ["build", "preview"].includes(process.argv[2]) ? process.argv[2] : "dev";
const vite = path.join(root, "node_modules", "vite", "bin", "vite.js");
const child = spawn(process.execPath, [vite, mode, "--configLoader", "runner"], {
  stdio: "inherit",
  env: { ...process.env, XDG_CONFIG_HOME: configHome, WRANGLER_SEND_METRICS: "false" }
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
