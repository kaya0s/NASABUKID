import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdvisorChat, type AdvisorMessage } from "./advisor-chat";
const send = vi.fn();
function Harness({ busy = false, failed = false }: { busy?: boolean; failed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<"auto" | "bisaya">("auto");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AdvisorMessage[]>(
    failed
      ? [
          { role: "user", text: "Why this crop?" },
          { role: "assistant", text: "The advisor could not reach Google.", error: true },
        ]
      : [{ role: "assistant", text: "How can I help?" }],
  );
  return (
    <>
      <h1>Farm workspace</h1>
      <button onClick={() => setOpen(true)}>Explain crop result</button>
      <AdvisorChat
        open={open}
        onOpenChange={setOpen}
        messages={messages}
        busy={busy}
        input={input}
        onInputChange={setInput}
        language={language}
        onLanguageChange={setLanguage}
        onSend={(question = input) => {
          send(question);
          setMessages((current) => [...current, { role: "user", text: question }]);
          setInput("");
        }}
        workflow="prevention"
        context="Corn · Planned planting 2027-12-15"
      />
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("opens in place, focuses the composer, and returns focus to the result button with Escape", async () => {
  render(<Harness />);
  const launcher = screen.getByRole("button", { name: "Explain crop result" });
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Open AI field advisor" })).not.toBeInTheDocument();
  launcher.focus();
  fireEvent.click(launcher);
  expect(screen.getByRole("region", { name: "AI field advisor" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Farm workspace" })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Ask a question" })).toHaveFocus(),
  );
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
  await waitFor(() => expect(launcher).toHaveFocus());
});
it("preserves a draft and conversation when minimized and reopened", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Explain crop result" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Explain the soil conditions" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Back to result" }));
  await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Explain crop result" }));
  expect(screen.getByRole("textbox")).toHaveValue("Explain the soil conditions");
  fireEvent.click(screen.getByRole("button", { name: "Send question" }));
  expect(send).toHaveBeenCalledWith("Explain the soil conditions");
  expect(screen.getByRole("log")).toHaveTextContent("Explain the soil conditions");
  fireEvent.click(screen.getByRole("button", { name: "Back to result" }));
  fireEvent.click(screen.getByRole("button", { name: "Explain crop result" }));
  expect(screen.getByRole("log")).toHaveTextContent("Explain the soil conditions");
});
it("keeps crop planning focus and prevents duplicate sends while busy", () => {
  render(<Harness busy />);
  fireEvent.click(screen.getByRole("button", { name: "Explain crop result" }));
  expect(screen.getByText("Crop planning")).toBeInTheDocument();
  expect(screen.queryByText("Damage recovery")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "What should I do?" } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Why this next crop?" })).toBeDisabled();
  expect(send).not.toHaveBeenCalled();
});
it("keeps Shift+Enter and composing input from sending a message", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Explain crop result" }));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Question" } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(send).toHaveBeenCalledOnce();
});

it("retries the failed question without making the farmer type it again", () => {
  render(<Harness failed />);
  fireEvent.click(screen.getByRole("button", { name: "Explain crop result" }));
  fireEvent.click(screen.getByRole("button", { name: "Retry answer" }));
  expect(send).toHaveBeenCalledWith("Why this crop?");
});

it("switches Bisaya replies on and off without altering the conversation", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Explain crop result" }));
  const button = screen.getByRole("button", { name: "Bisaya" });
  expect(button).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Motubag sa Bisaya.")).toBeInTheDocument();
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("log")).toHaveTextContent("How can I help?");
});
