import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "./ui";

const STEPS = [
  { target: "upload", title: "tour.s1t", text: "tour.s1" },
  { target: "history", title: "tour.s2t", text: "tour.s2" },
  { target: "nav-notifications", title: "tour.s3t", text: "tour.s3" },
  { target: "nav-settings", title: "tour.s4t", text: "tour.s4" },
];

export function Tour({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i];

  useLayoutEffect(() => {
    const find = () => {
      const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)];
      const el = all.find((e) => e.offsetParent !== null) ?? null;
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setRect(el ? el.getBoundingClientRect() : null);
    };
    find();
    window.addEventListener("resize", find);
    window.addEventListener("scroll", find, true);
    return () => {
      window.removeEventListener("resize", find);
      window.removeEventListener("scroll", find, true);
    };
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onFinish();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFinish]);

  const pad = 8;
  const last = i === STEPS.length - 1;
  const below = rect ? rect.top < window.innerHeight / 2 : true;
  const cardStyle = rect
    ? below
      ? { top: Math.min(rect.bottom + 16, window.innerHeight - 220) }
      : { bottom: Math.max(window.innerHeight - rect.top + 16, 16) }
    : { top: "40%" };

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label={t(step.title)}>
      {rect && (
        <div className="tour-hole" style={{
          top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
        }} />
      )}
      {!rect && <div className="tour-dim" />}
      <div className="tour-card" style={cardStyle}>
        <div className="tour-dots">{STEPS.map((_, k) => <span key={k} className={k === i ? "on" : ""} />)}</div>
        <h3>{t(step.title)}</h3>
        <p>{t(step.text)}</p>
        <div className="tour-actions">
          <button type="button" className="link-btn" onClick={onFinish}>{t("tour.skip")}</button>
          <div className="row gap-sm">
            {i > 0 && <Button variant="secondary" onClick={() => setI(i - 1)}>{t("tour.back")}</Button>}
            <Button onClick={() => (last ? onFinish() : setI(i + 1))}>{last ? t("tour.finish") : t("tour.next")}</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
