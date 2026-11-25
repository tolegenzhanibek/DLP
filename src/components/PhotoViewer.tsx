import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconX } from "./icons";

/** Full-screen photo view: blurred photo as the backdrop, the photo in a large circle, ✕ to close. */
export function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    // Capture phase so an edit sheet underneath does not also close on Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={t("profile.photo")} onClick={onClose}>
      <img className="photo-viewer-bg" src={url} alt="" aria-hidden="true" />
      <button type="button" className="photo-viewer-close" aria-label={t("common.close")} autoFocus
        onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <IconX width={28} height={28} />
      </button>
      <img className="photo-viewer-img" src={url} alt={t("profile.photo")} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}
