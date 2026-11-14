export type ServerPortOptions = {
  nodeEnv?: string;
  configuredPort?: string | number;
  fallbackPort?: number;
  findAvailablePort?: (startPort: number) => Promise<number>;
};

/**
 * Cloud Run and similar gateways route to the platform-provided PORT.
 * Only local development may probe for another free port.
 */
export async function resolveServerPort(options: ServerPortOptions = {}): Promise<number> {
  const fallbackPort = options.fallbackPort ?? 3000;
  const configuredPort = Number(options.configuredPort ?? fallbackPort);
  const preferredPort = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : fallbackPort;

  if (options.nodeEnv !== "development") return preferredPort;
  if (!options.findAvailablePort) return preferredPort;
  return options.findAvailablePort(preferredPort);
}
