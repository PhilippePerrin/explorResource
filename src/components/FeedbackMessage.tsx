const ALERT_PATTERNS = [
  /^unable\b/i,
  /^select\b/i,
  /\berror\b/i,
  /\bfailed\b/i,
  /\binvalid\b/i,
  /\bblocking\b/i,
  /\bresolve\b/i,
  /\bcannot\b/i,
];

interface FeedbackMessageProps {
  message: string;
}

function isAlertMessage(message: string) {
  const trimmedMessage = message.trim();

  return ALERT_PATTERNS.some((pattern) => pattern.test(trimmedMessage));
}

export function FeedbackMessage({ message }: FeedbackMessageProps) {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return null;
  }

  const isAlert = isAlertMessage(trimmedMessage);

  return (
    <>
      <div aria-live={isAlert ? 'assertive' : 'polite'} className="sr-only">
        {trimmedMessage}
      </div>
      <p
        className={`rounded-lg px-4 py-3 text-sm ${
          isAlert
            ? 'border border-red-500/50 bg-red-950/20'
            : 'border border-[var(--surf-divider)] bg-[var(--surf-800)]'
        }`}
        role={isAlert ? 'alert' : 'status'}
      >
        {trimmedMessage}
      </p>
    </>
  );
}
