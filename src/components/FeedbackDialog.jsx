import React, { useEffect, useRef } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const TITLES = { success: "Success", error: "Something went wrong", info: "Notice" };

export default function FeedbackDialog({ type = "success", message, onClose, title }) {
  if (type === "info") return null;

  const buttonRef = useRef(null);
  const duration = type === "error" ? 6500 : 4500;
  const Icon = ICONS[type] || Info;

  useEffect(() => {
    if (!message || type === "info") return undefined;
    buttonRef.current?.focus();
    const timer = window.setTimeout(onClose, duration);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [duration, message, onClose]);

  if (!message) return null;

  return (
    <div className="feedback-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`feedback-dialog feedback-${type}`} role="alertdialog" aria-modal="true" aria-labelledby="feedback-title" aria-describedby="feedback-message">
        <button type="button" className="feedback-close" aria-label="Close notification" onClick={onClose}>
          <X size={19} />
        </button>
        <div className="feedback-icon" aria-hidden="true"><Icon size={34} strokeWidth={2.2} /></div>
        <h2 id="feedback-title">{title || TITLES[type] || TITLES.info}</h2>
        <p id="feedback-message">{message}</p>
        <button ref={buttonRef} type="button" className="btn feedback-action" onClick={onClose}>
          {type === "error" ? "Close" : "Continue"}
        </button>
        <div className="feedback-progress" aria-hidden="true"><span style={{ animationDuration: `${duration}ms` }} /></div>
      </section>
    </div>
  );
}
