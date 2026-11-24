// Deterministic detectors. They run BEFORE the AI and set a floor for the verdict:
// the AI can raise the level, never lower it below what these rules found.
// Pure TypeScript, no runtime imports, so it runs in Deno (edge) and Node (tests).

export type Level = "public" | "internal" | "confidential" | "restricted";
export const LEVELS: Level[] = ["public", "internal", "confidential", "restricted"];

export type FindingType =
  | "iin" | "bin" | "card" | "iban" | "passport" | "email" | "phone"
  | "private_key" | "api_key" | "password" | "jwt"
  | "marker_restricted" | "marker_confidential" | "marker_internal" | "policy_rule";

export interface Finding {
  type: FindingType;
  count: number;
  level: Level;
  samples: string[]; // masked, at most 3
  rule?: string; // policy rule name for type = policy_rule
}

export interface DetectionResult {
  level: Level;
  findings: Finding[];
  categories: string[];
  redacted: string; // text with every match replaced by a [TYPE] token, sent to the AI
}

export interface PolicyRule {
  name: string;
  keywords: string[];
  level: Level;
}

export const maxLevel = (...levels: (Level | null | undefined)[]): Level =>
  levels.reduce<Level>(
    (acc, l) => (l && LEVELS.indexOf(l) > LEVELS.indexOf(acc) ? l : acc),
    "public",
  );

// ---------------------------------------------------------------- validators
const digits = (s: string) => s.replace(/\D/g, "");

/** Kazakhstan IIN/BIN checksum (two weight passes, mod 11). */
export function kzIdChecksumOk(id: string): boolean {
  if (!/^\d{12}$/.test(id)) return false;
  const d = id.split("").map(Number);
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
  let c = w1.reduce((s, w, i) => s + w * d[i], 0) % 11;
  if (c === 10) {
    c = w2.reduce((s, w, i) => s + w * d[i], 0) % 11;
    if (c === 10) return false;
  }
  return c === d[11];
}

/** IIN = YYMMDD + century/sex digit (1-6) + ... ; BIN has 4/5/6 at position 5 and no birth date. */
export function classifyKzId(id: string): "iin" | "bin" | null {
  if (!kzIdChecksumOk(id)) return null;
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  const c = Number(id[6]);
  if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && c >= 1 && c <= 6) return "iin";
  if (["4", "5", "6"].includes(id[4])) return "bin";
  return null;
}

export function luhnOk(num: string): boolean {
  const d = digits(num);
  if (d.length < 13 || d.length > 19 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function ibanOk(raw: string): boolean {
  const iban = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith("KZ") && iban.length !== 20) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const x of v) rem = (rem * 10 + Number(x)) % 97;
  }
  return rem === 1;
}

export function mask(value: string): string {
  const v = value.trim();
  if (v.length <= 4) return "*".repeat(v.length);
  const keep = v.length >= 10 ? 2 : 1;
  return v.slice(0, keep) + "*".repeat(Math.min(v.length - keep * 2, 12)) + v.slice(-keep);
}

// ---------------------------------------------------------------- patterns
interface Pattern {
  type: FindingType;
  re: RegExp;
  level: Level;
  category: string;
  validate?: (m: string) => FindingType | boolean;
}

const PATTERNS: Pattern[] = [
  {
    type: "private_key",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g,
    level: "restricted",
    category: "credentials",
  },
  {
    type: "api_key",
    re: /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|xox[abprs]-[A-Za-z0-9-]{10,}|sk-(?:ant-|proj-|live_|test_)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{20})\b/g,
    level: "restricted",
    category: "credentials",
  },
  {
    type: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    level: "restricted",
    category: "credentials",
  },
  {
    type: "password",
    re: /(?:password|passwd|pwd|пароль|құпиясөз)\s*[:=]\s*["']?[^\s"']{6,}/gi,
    level: "restricted",
    category: "credentials",
  },
  {
    type: "card",
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    level: "confidential",
    category: "financial",
    validate: luhnOk,
  },
  {
    type: "iban",
    re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g,
    level: "confidential",
    category: "financial",
    validate: ibanOk,
  },
  {
    type: "iin",
    re: /(?<!\d)\d{12}(?!\d)/g,
    level: "confidential",
    category: "pii",
    validate: (m) => classifyKzId(m) ?? false,
  },
  {
    type: "passport",
    re: /\bN\d{8}\b/g,
    level: "confidential",
    category: "pii",
  },
  {
    type: "email",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g,
    level: "internal",
    category: "pii",
  },
  {
    type: "phone",
    re: /(?<![\d+])(?:\+7|8)[\s(-]*7\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g,
    level: "internal",
    category: "pii",
  },
];

const MARKERS: { type: FindingType; level: Level; re: RegExp }[] = [
  {
    type: "marker_restricted",
    level: "restricted",
    re: /strictly confidential|top secret|строго конфиденциально|совершенно секретно|қатаң құпия|аса құпия/gi,
  },
  {
    type: "marker_confidential",
    level: "confidential",
    re: /\bconfidential\b|конфиденциально|коммерческая тайна|для служебного пользования|\bДСП\b|құпия|коммерциялық құпия|қызмет бабында пайдалану үшін/gi,
  },
  {
    type: "marker_internal",
    level: "internal",
    re: /internal use only|for internal use|для внутреннего пользования|ішкі пайдалану үшін/gi,
  },
];

// Many personal records in one document = a data dump: escalate.
const BULK_PII = 20;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function detect(text: string, rules: PolicyRule[] = []): DetectionResult {
  const found = new Map<string, Finding>();
  const spans: { start: number; end: number; token: string }[] = [];
  const categories = new Set<string>();

  const add = (type: FindingType, level: Level, value: string, start: number, rule?: string) => {
    const key = rule ? `${type}:${rule}` : type;
    const f = found.get(key) ?? { type, count: 0, level, samples: [], ...(rule ? { rule } : {}) };
    f.count++;
    if (f.samples.length < 3 && !type.startsWith("marker") && type !== "policy_rule") {
      f.samples.push(mask(value));
    }
    found.set(key, f);
    spans.push({ start, end: start + value.length, token: `[${type.toUpperCase()}]` });
  };

  const overlaps = (s: number, e: number) => spans.some((x) => s < x.end && e > x.start);

  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const start = m.index ?? 0;
      const value = m[0];
      if (overlaps(start, start + value.length)) continue;
      let type = p.type;
      if (p.validate) {
        const r = p.validate(value);
        if (!r) continue;
        if (typeof r === "string") type = r;
      }
      const level = type === "bin" ? "internal" : p.level;
      add(type, level, value, start);
      categories.add(p.category);
    }
  }

  for (const mk of MARKERS) {
    for (const m of text.matchAll(mk.re)) add(mk.type, mk.level, m[0], m.index ?? 0);
  }

  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (!kw || kw.length < 2) continue;
      const re = new RegExp(escapeRe(kw), "gi");
      for (const m of text.matchAll(re)) {
        const start = m.index ?? 0;
        if (overlaps(start, start + m[0].length)) continue;
        add("policy_rule", rule.level, m[0], start, rule.name);
        categories.add("policy");
      }
    }
  }

  const findings = [...found.values()];
  for (const f of findings) {
    if ((f.type === "email" || f.type === "phone") && f.count >= BULK_PII) f.level = "confidential";
    if ((f.type === "iin" || f.type === "card" || f.type === "passport") && f.count >= BULK_PII) {
      f.level = "restricted";
    }
  }

  // Build the redacted copy (spans sorted, non-overlapping by construction except markers).
  const sorted = spans
    .filter((s) => !s.token.startsWith("[MARKER"))
    .sort((a, b) => a.start - b.start);
  let redacted = "";
  let pos = 0;
  for (const s of sorted) {
    if (s.start < pos) continue;
    redacted += text.slice(pos, s.start) + s.token;
    pos = s.end;
  }
  redacted += text.slice(pos);

  return {
    level: maxLevel(...findings.map((f) => f.level)),
    findings: findings.sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || b.count - a.count),
    categories: [...categories],
    redacted,
  };
}
