interface Props {
  message: string;
  actionLabel: string;
  onAction: () => void;
}

/** Non-blocking runtime error (e.g. camera unplugged mid-session). */
export function ErrorNotice({ message, actionLabel, onAction }: Props) {
  return (
    <div id="error-notice" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
