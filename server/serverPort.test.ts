import { describe, expect, it } from "vitest";
import { resolveServerPort } from "./_core/serverPort";

describe("resolveServerPort", () => {
  it("keeps the platform PORT in production even when another port is free", async () => {
    const findAvailablePort = async () => 3001;
    await expect(resolveServerPort({ nodeEnv: "production", configuredPort: "8080", findAvailablePort })).resolves.toBe(8080);
  });

  it("probes for a free port only during development", async () => {
    const findAvailablePort = async (startPort: number) => startPort + 1;
    await expect(resolveServerPort({ nodeEnv: "development", configuredPort: "3000", findAvailablePort })).resolves.toBe(3001);
  });
});
