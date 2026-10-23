/** Base class for every error that crosses a port boundary. */
export class PortError extends Error {
  readonly code: string;

  constructor(message: string, code: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PortError";
    this.code = code;
  }
}

/** The thing you asked for does not exist. Retrying will not help. */
export class NotFoundError extends PortError {
  constructor(what: string) {
    super(`${what} not found`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/** A temporary failure (timeout, node down). Retrying may help. */
export class TransientError extends PortError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, "TRANSIENT", options);
    this.name = "TransientError";
  }
}

/** The caller sent something invalid. Retrying the same call will not help. */
export class InvalidRequestError extends PortError {
  constructor(message: string) {
    super(message, "INVALID_REQUEST");
    this.name = "InvalidRequestError";
  }
}
