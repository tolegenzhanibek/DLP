// Client-side text extraction. The file itself is never uploaded; only its text goes to the classifier.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CHARS = 100_000;

const TEXT_EXT = ["txt", "csv", "md", "json", "log", "xml", "html", "yml", "yaml", "tsv"];

export class ExtractError extends Error {}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function extractText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new ExtractError("file_too_big");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf" || file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      if (parts.join("\n").length > MAX_CHARS) break;
    }
    return parts.join("\n");
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value;
  }

  if (TEXT_EXT.includes(ext) || file.type.startsWith("text/")) return file.text();

  throw new ExtractError("unsupported");
}
