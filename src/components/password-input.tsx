import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const REVEAL_MS = 10_000;

/**
 * Password input with an eye toggle that reveals text for 10 seconds and
 * then auto-masks. Used on the /auth form and in the admin "Change password"
 * section. Uses the shared `.tv-auth-input-wrap` / `.tv-auth-eye*` styles.
 */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  required = true,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
  minLength: number;
  required?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;
  };

  useEffect(() => () => clearTimers(), []);

  const reveal = () => {
    setRevealed(true);
    setCountdown(Math.ceil(REVEAL_MS / 1000));
    clearTimers();
    intervalRef.current = window.setInterval(() => {
      setCountdown((c) => (c > 1 ? c - 1 : 0));
    }, 1000);
    timerRef.current = window.setTimeout(() => {
      setRevealed(false);
      setCountdown(0);
      clearTimers();
    }, REVEAL_MS);
  };

  const mask = () => {
    setRevealed(false);
    setCountdown(0);
    clearTimers();
  };

  return (
    <div className="tv-auth-input-wrap">
      <input
        id={id}
        type={revealed ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {revealed && countdown > 0 && (
        <span className="tv-auth-eye-count" aria-hidden="true">
          {countdown}s
        </span>
      )}
      <button
        type="button"
        className="tv-auth-eye"
        onClick={revealed ? mask : reveal}
        aria-label={revealed ? "Hide password" : `Show password for ${REVEAL_MS / 1000} seconds`}
        aria-pressed={revealed}
        tabIndex={-1}
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
