import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./ui";

const OUT = 512;
const VIEW = 280;

/** Square crop with drag + zoom. Returns a 512x512 WebP blob. */
export function AvatarCropper({ file, onCancel, onDone }: {
  file: File; onCancel: () => void; onDone: (blob: Blob) => void;
}) {
  const { t } = useTranslation();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = img ? VIEW / Math.min(img.width, img.height) : 1;
  const scale = base * zoom;
  const w = (img?.width ?? 0) * scale;
  const h = (img?.height ?? 0) * scale;
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(VIEW - w, p.x)),
    y: Math.min(0, Math.max(VIEW - h, p.y)),
  });

  useEffect(() => {
    if (img) setPos(clamp({ x: (VIEW - w) / 2, y: (VIEW - h) / 2 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img]);
  useEffect(() => setPos((p) => clamp(p)), [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const down = (e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const move = (e: PointerEvent) => {
    if (!drag.current) return;
    setPos(clamp({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }));
  };

  function done() {
    if (!img) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d")!;
    const k = OUT / VIEW;
    ctx.drawImage(img, pos.x * k, pos.y * k, w * k, h * k);
    canvas.toBlob((b) => b && onDone(b), "image/webp", 0.9);
  }

  return (
    <Modal open title={t("profile.cropTitle")} onClose={onCancel} onDone={done} doneLoading={busy} doneDisabled={!img}>
      <div className="cropper">
        <div className="crop-view" style={{ width: VIEW, height: VIEW }} onPointerDown={down} onPointerMove={move}
          onPointerUp={() => (drag.current = null)}>
          {img && <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(${pos.x}px, ${pos.y}px)` }} />}
        </div>
        <label className="zoom">
          <span>{t("profile.zoom")}</span>
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
      </div>
    </Modal>
  );
}
