import { BRAND, LOGO_SRC } from "../lib/constants";

export type LoaderState = "loading" | "complete" | "fading" | "error";

interface Props {
  state: LoaderState;
  errorMessage?: string;
}

/** Full-screen splash shown while the camera and hand-tracking model start. */
export function LoadingScreen({ state, errorMessage }: Props) {
  const isError = state === "error";
  return (
    <div
      id="loading-screen"
      className={state === "fading" ? "fade-out" : undefined}
      role={isError ? "alert" : "status"}
      aria-live="polite"
      aria-busy={state === "loading"}
    >
      <div className="loader-content">
        <img src={LOGO_SRC} alt={BRAND.name} className="loader-logo" width={236} height={64} />
        <p className="brand-tagline">{BRAND.tagline}</p>
        <p className={`loader-subtitle${isError ? " is-error" : ""}`}>
          {isError ? errorMessage : "Initializing hand tracking..."}
        </p>
        {!isError && (
          <div className="loader-bar" aria-hidden="true">
            <div className={`loader-bar-fill${state !== "loading" ? " complete" : ""}`} />
          </div>
        )}
      </div>
    </div>
  );
}
