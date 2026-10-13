import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, InitError, cameraErrorKind, toInitError } from "../src/lib/errors";

describe("camera error mapping", () => {
  it.each([
    ["NotAllowedError", "permission"],
    ["SecurityError", "permission"],
    ["NotFoundError", "noCamera"],
    ["OverconstrainedError", "noCamera"],
    ["NotReadableError", "inUse"],
    ["TypeError", "unsupported"],
    ["SomethingElse", "unknown"],
  ])("%s -> %s", (name, kind) => {
    expect(cameraErrorKind({ name })).toBe(kind);
  });

  it("uses the reference's wording for permission errors", () => {
    expect(new InitError("permission").message).toBe(
      "Error: Camera access required. Please allow camera permissions and reload.",
    );
  });

  it("wraps unknown errors", () => {
    const e = toInitError(new Error("boom"), "model");
    expect(e.kind).toBe("model");
    expect(e.message).toBe(ERROR_MESSAGES.model);
    const same = new InitError("noCamera");
    expect(toInitError(same)).toBe(same);
  });
});
