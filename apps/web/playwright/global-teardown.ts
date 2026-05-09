async function globalTeardown() {
  if (process.env.CI) {
    console.log("[global-teardown] CI — data cleanup handled by ephemeral DB.");
    return;
  }

  console.log("[global-teardown] Local — data left intact for debugging.");
  // Run `pnpm db:seed` to reset when needed
}

export default globalTeardown;
