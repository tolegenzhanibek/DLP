export type Level = "public" | "internal" | "confidential" | "restricted";
export const LEVELS: Level[] = ["public", "internal", "confidential", "restricted"];
export type ReviewStatus = "pending" | "confirmed" | "disputed" | "rejected";
export type Theme = "light" | "dark" | "system";
export type Visibility = "everyone" | "admins" | "nobody";
export type Gender = "male" | "female" | "unspecified";
export type AccountStatus = "pending" | "active" | "blocked";

export interface Profile {
  id: string;
  nickname: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  links: string[];
  gender: Gender;
  city: string | null;
  phone: string | null;
  email: string | null;
  new_email: string | null;
  email_confirmed: boolean;
  role: "user" | "admin";
  status: AccountStatus;
  blocked_reason: string | null;
  theme: Theme;
  language: "kk" | "ru" | "en";
  online_visibility: Visibility;
  push_enabled: boolean;
  onboarded_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface Finding {
  type: string;
  count: number;
  level: Level;
  samples: string[];
  rule?: string;
}

export interface Scan {
  id: string;
  owner_id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  char_count: number;
  rule_level: Level;
  ai_level: Level | null;
  final_level: Level;
  ai_status: "ok" | "unavailable" | "refused" | "skipped";
  ai_confidence: number | null;
  categories: string[];
  findings: Finding[];
  summary: string | null;
  rationale: string | null;
  review_status: ReviewStatus;
  user_suggested_level: Level | null;
  user_comment: string | null;
  admin_comment: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  kind: "scan_done" | "scan_resolved" | "dispute_new" | "account_approved" | "account_blocked";
  data: { scan_id?: string; file_name?: string; level?: Level; accepted?: boolean };
  read_at: string | null;
  created_at: string;
}
