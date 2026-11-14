import { plainAdvisorText } from "@/lib/advisor-text";
import type { AdvisorLanguage } from "@/lib/advisor";
import { useEffect, useRef, type FormEvent } from "react";
import { ArrowLeft, ArrowUp, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type AdvisorMessage = { role: "assistant" | "user"; text: string; error?: boolean };
type Workflow = "prevention" | "recovery";
const QUESTIONS: Record<Workflow, string[]> = {
  prevention: ["Why this next crop?", "What should I check before planting?"],
  recovery: ["What should I check first?", "Explain my loss estimate"],
};

export function AdvisorChat({
  open,
  onOpenChange,
  messages,
  busy,
  input,
  onInputChange,
  onSend,
  workflow,
  context,
  language,
  onLanguageChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: AdvisorMessage[];
  busy: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: (question?: string) => void;
  workflow: Workflow;
  context: string;
  language: AdvisorLanguage;
  onLanguageChange: (language: AdvisorLanguage) => void;
}) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && messagesRef.current)
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [open, messages, busy]);
  const retryQuestion = messages.at(-1)?.error
    ? [...messages].reverse().find((message) => message.role === "user")?.text
    : undefined;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (input.trim() && !busy) onSend();
  }
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <section
      className="advisor-chat-card"
      aria-label="AI field advisor"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onOpenChange(false);
        }
      }}
    >
      <header className="advisor-chat-header">
        <span className="advisor-chat-mark" aria-hidden="true">
          <Sprout size={22} />
        </span>
        <div>
          <h2>Field advisor</h2>
          <p>AI help for your farm</p>
        </div>
        <Button
          variant="outline"
          className="advisor-chat-language"
          aria-pressed={language === "bisaya"}
          disabled={busy}
          title="Reply in Bisaya (Cebuano)"
          onClick={() => onLanguageChange(language === "bisaya" ? "auto" : "bisaya")}
        >
          Bisaya
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to result"
          onClick={() => onOpenChange(false)}
        >
          <ArrowLeft size={18} />
        </Button>
      </header>
      <p className="advisor-chat-focus">{workflow === "prevention" ? "Crop planning" : "Damage recovery"}</p>
      <p className="advisor-chat-context">
        {context}
        {language === "bisaya" && (
          <span className="advisor-chat-language-note">Motubag sa Bisaya.</span>
        )}
      </p>
      <div
        ref={messagesRef}
        className="advisor-chat-messages"
        role="log"
        aria-label="Advisor conversation"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={busy}
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={`advisor-chat-message ${message.role === "user" ? "is-user" : ""} ${message.error ? "is-error" : ""}`}
          >
            <span>{message.role === "user" ? "You" : "Field advisor"}</span>
            <p>
              {message.role === "assistant" && !message.error
                ? plainAdvisorText(message.text)
                : message.text}
            </p>
          </div>
        ))}
        {busy && (
          <p className="advisor-chat-thinking" role="status">
            Thinking about your field…
          </p>
        )}
      </div>
      {messages.length === 1 && (
        <div className="advisor-chat-questions" aria-label="Suggested questions">
          {QUESTIONS[workflow].map((question) => (
            <button key={question} type="button" disabled={busy} onClick={() => onSend(question)}>
              {question}
            </button>
          ))}
        </div>
      )}
      {retryQuestion && (
        <Button
          className="advisor-chat-retry"
          variant="outline"
          disabled={busy}
          onClick={() => onSend(retryQuestion)}
        >
          Retry answer
        </Button>
      )}
      <form className="advisor-chat-composer" onSubmit={submit}>
        <Textarea
          ref={inputRef}
          aria-label="Ask a question"
          placeholder="Ask a question..."
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          rows={2}
          maxLength={1200}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing)
              submit(event);
          }}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send question"
          disabled={!input.trim() || busy}
        >
          <ArrowUp size={19} />
        </Button>
      </form>
      <p className="advisor-chat-note">
        AI guidance. Confirm field decisions with a local agricultural technician.
      </p>
    </section>
  );
}
