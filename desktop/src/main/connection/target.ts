/**
 * Where the shell forwards ``octop://app/api`` and the WebSocket relay.
 *
 * The renderer never supplies this value. Local mode is the sidecar's loopback
 * port; remote mode is the origin saved from the connection form.
 */

export interface BackendTarget {
  /** ``http://127.0.0.1:<port>`` or ``https://host[:port]``. No path. */
  origin: string;
  /** Hostname only. IPv6 is unbracketed; dialers add brackets when required. */
  host: string;
  port: number;
  tls: boolean;
  /** Value of the upstream ``Host`` header. */
  hostHeader: string;
}

export function loopbackTarget(port: number): BackendTarget | null {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    origin: `http://127.0.0.1:${port}`,
    host: "127.0.0.1",
    port,
    tls: false,
    hostHeader: `127.0.0.1:${port}`,
  };
}

/** Octop API responses are not served by following a redirect to another host. */
export function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
