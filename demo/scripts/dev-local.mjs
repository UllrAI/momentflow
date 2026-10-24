import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const backend = fileURLToPath(new URL("../../backend", import.meta.url));
const children = [
  spawn(
    "uv",
    [
      "run",
      "--directory",
      backend,
      "uvicorn",
      "momentflow.app:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8766",
    ],
    { stdio: "inherit" },
  ),
  spawn("npm", ["run", "dev:ui", "--", ...process.argv.slice(2)], {
    stdio: "inherit",
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
