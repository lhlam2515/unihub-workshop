import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

async function globalSetup() {
  // Ensure .auth directory exists
  const authDir = path.resolve(__dirname, ".auth");
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Seed database (idempotent — clears + re-inserts)
  console.log("[global-setup] Seeding database...");
  execSync("pnpm db:seed", {
    cwd: path.resolve(__dirname, "../../server"),
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" },
  });
}

export default globalSetup;
