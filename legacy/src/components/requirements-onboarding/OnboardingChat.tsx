// Ported near-verbatim from document-query-flow/src/components/onboarding/OnboardingChat.tsx.
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Send, Loader2, FileCheck2, HelpCircle } from "lucide-react";

export interface ChatBubble {
  id: number;
  role: "user" | "assistant";
  content: string;
}

interface OnboardingChatProps {
  bubbles: ChatBubble[];
  questions: string[];
  isThinking: boolean;
  readyToGenerate: boolean;
  /** True once enough is captured that the user may force early generation. */
  allowManualGenerate: boolean;
  onSend: (text: string) => void;
  onGenerate: () => void;
}

// Playful, rotating status lines shown while the engine is thinking.
const THINKING_LINES = [
  "Listening carefully…",
  "Understanding your answer…",
  "Connecting the dots…",
  "Updating what I know…",
  "Gathering more detail…",
  "Refining the requirements…",
  "Thinking about what's next…",
];

const OnboardingChat = ({
  bubbles,
  questions,
  isThinking,
  readyToGenerate,
  allowManualGenerate,
  onSend,
  onGenerate,
}: OnboardingChatProps) => {
  const [input, setInput] = useState("");
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, isThinking, questions]);

  // Cycle through the playful loader lines while thinking.
  useEffect(() => {
    if (!isThinking) {
      setThinkingIdx(0);
      return;
    }
    const id = setInterval(
      () => setThinkingIdx((i) => (i + 1) % THINKING_LINES.length),
      1600
    );
    return () => clearInterval(id);
  }, [isThinking]);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || isThinking) return;
    onSend(value);
    setInput("");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10">
            <Bot className="h-4 w-4 text-cyan-300" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">
              Requirements interview
            </p>
            <p className="onb-eyebrow text-[0.6rem] text-slate-500">
              Conversational onboarding
            </p>
          </div>
        </div>
        {readyToGenerate ? (
          <button
            onClick={onGenerate}
            className="onb-btn-hud flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs"
          >
            <FileCheck2 className="h-4 w-4" /> Generate documents
          </button>
        ) : (
          allowManualGenerate && (
            <button
              onClick={onGenerate}
              title="The interview isn't complete yet — generating now may leave gaps."
              className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-slate-400 transition hover:border-cyan-400/40 hover:text-slate-200"
            >
              <FileCheck2 className="h-3.5 w-3.5" /> Generate anyway
            </button>
          )
        )}
      </div>

      {/* Messages */}
      <div className="onb-scroll flex-1 space-y-5 overflow-y-auto px-5 py-6">
        {bubbles.map((b) => (
          <div
            key={b.id}
            className={`onb-rise flex ${
              b.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {b.role === "assistant" && (
              <span className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
                <Bot className="h-4 w-4 text-cyan-300" />
              </span>
            )}
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                b.role === "user"
                  ? "rounded-br-sm bg-cyan-400 text-[#06212a]"
                  : "rounded-bl-sm border border-[var(--line)] bg-[var(--ink-800)] text-slate-200"
              }`}
            >
              {b.role === "assistant" ? (
                <div className="onb-prose">
                  <ReactMarkdown>{b.content}</ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{b.content}</span>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="onb-rise ml-9 flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            </span>
            <span
              key={thinkingIdx}
              className="onb-rise text-sm text-slate-400"
            >
              {THINKING_LINES[thinkingIdx]}
            </span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--line)] p-4">
        {questions.length > 0 && !isThinking && (
          <button
            onClick={() => submit("I don't know — please make a reasonable assumption.")}
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--ink-800)] px-3 py-1.5 text-xs text-slate-400 transition hover:border-cyan-400/40 hover:text-slate-200"
          >
            <HelpCircle className="h-3.5 w-3.5" /> I don't know — assume for me
          </button>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            disabled={isThinking}
            placeholder="Type your answer… (Shift+Enter for a new line)"
            className="onb-scroll max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--line)] bg-[var(--ink-750)] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
          />
          <button
            onClick={() => submit(input)}
            disabled={isThinking || !input.trim()}
            className="onb-btn-hud flex h-[44px] w-[44px] items-center justify-center rounded-xl"
          >
            {isThinking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingChat;
