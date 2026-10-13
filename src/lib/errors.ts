/** User-facing messages for initialisation failures, styled like the reference's loader error. */
export const ERROR_MESSAGES = {
  permission: "Error: Camera access required. Please allow camera permissions and reload.",
  noCamera: "Error: No camera found. Connect a webcam and reload.",
  inUse: "Error: Camera is in use by another app. Close it and reload.",
  unsupported: "Error: This browser does not support camera access. Use a recent Chrome, Edge, Firefox or Safari over HTTPS.",
  insecure: "Error: Camera access requires a secure (HTTPS) connection.",
  model: "Error: Hand-tracking model failed to load. Check your connection and reload.",
  disconnected: "Camera disconnected",
  tracking: "Hand tracking stopped unexpectedly",
  unknown: "Error: Could not start Veyra. Please reload and try again.",
} as const;

export type InitErrorKind = keyof typeof ERROR_MESSAGES;

export class InitError extends Error {
  constructor(
    public kind: InitErrorKind,
    public cause?: unknown,
  ) {
    super(ERROR_MESSAGES[kind]);
    this.name = "InitError";
  }
}

/** Maps a getUserMedia rejection (DOMException name) to an error kind. */
export function cameraErrorKind(err: unknown): InitErrorKind {
  const name = (err as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "permission";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "noCamera";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "inUse";
    case "TypeError":
      return "unsupported";
    default:
      return "unknown";
  }
}

export function toInitError(err: unknown, fallback: InitErrorKind = "unknown"): InitError {
  return err instanceof InitError ? err : new InitError(fallback, err);
}
