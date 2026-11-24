import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { IconArrowUp, IconPlus } from "./icons";
import { Spinner } from "./ui";

const ACCEPT = ".pdf,.docx,.txt,.csv,.md,.json,.log,.xml,.tsv,.yml,.yaml,text/*,application/pdf";

/** Pill-shaped input: [+] attach file · auto-growing text · send. Enter sends, Shift+Enter = new line. */
export function Composer({ onText, onFile, busy, placeholder, autoFocus }: {
  onText: (text: string) => void;
  onFile?: (file: File) => void;
  busy?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const send = () => {
    if (!text.trim() || busy) return;
    onText(text);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && onFile && !busy) onFile(f);
  };

  return (
    <div className={`composer${drag ? " drag" : ""}`} data-tour="upload"
      onDragOver={(e) => { e.preventDefault(); if (onFile) setDrag(true); }}
      onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      {onFile && (
        <>
          <button type="button" className="icon-btn" aria-label={t("scan.attach")} title={t("scan.attach")}
            onClick={() => input.current?.click()} disabled={busy}>
            <IconPlus />
          </button>
          <input ref={input} type="file" hidden accept={ACCEPT}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </>
      )}
      <textarea ref={area} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
        placeholder={drag ? t("scan.dropHere") : placeholder ?? t("scan.composerPlaceholder")}
        aria-label={placeholder ?? t("scan.composerPlaceholder")} autoFocus={autoFocus} disabled={busy} />
      <button type="button" className="send-btn" aria-label={t("scan.send")} title={t("scan.send")}
        onClick={send} disabled={busy || !text.trim()}>
        {busy ? <Spinner small /> : <IconArrowUp />}
      </button>
    </div>
  );
}
