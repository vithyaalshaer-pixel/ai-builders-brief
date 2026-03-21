import { spawn } from "node:child_process";

const maxAttempts = Number(process.env.GENERATE_RETRIES ?? 3);

function runGenerate() {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "generate"], {
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`generate exited with code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    console.log(`Generate attempt ${attempt}/${maxAttempts}`);
    await runGenerate();
    process.exit(0);
  } catch (error) {
    if (attempt === maxAttempts) {
      throw error;
    }

    const delay = attempt * 15_000;
    console.warn(`Attempt ${attempt} failed. Retry in ${delay / 1000}s.`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
