"use client";

// Lightweight, zero-dependency password strength meter.
// Returns a score 0-4 (weak…strong) and a one-line explanation.
//
// Why not zxcvbn: that library is ~400KB+. For our purpose — nudging users
// past trivial passwords — a heuristic combining length, character variety,
// repetition, sequences, and a small common-password blocklist is enough.
// Real defence-in-depth is the server-side PBKDF2 hash, not the meter.

const COMMON = new Set([
  "password",
  "password1",
  "qwerty",
  "qwerty123",
  "123456",
  "123456789",
  "12345678",
  "111111",
  "abc123",
  "letmein",
  "welcome",
  "welcome1",
  "admin",
  "admin123",
  "iloveyou",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "passw0rd",
  "shiptrack",
]);

function hasRepeats(s: string): boolean {
  // Triples of the same char ("aaa") or repeated short blocks ("abcabc").
  return /(.)\1\1/.test(s) || /(.{2,4})\1+/.test(s);
}

function hasSequence(s: string): boolean {
  // 4+ chars of an ascending or descending letter/digit run (qwerty rows
  // intentionally ignored — heuristic enough).
  const lower = s.toLowerCase();
  for (let i = 0; i <= lower.length - 4; i++) {
    let asc = true,
      desc = true;
    for (let j = 1; j < 4; j++) {
      if (lower.charCodeAt(i + j) - lower.charCodeAt(i + j - 1) !== 1) asc = false;
      if (lower.charCodeAt(i + j) - lower.charCodeAt(i + j - 1) !== -1) desc = false;
    }
    if (asc || desc) return true;
  }
  return false;
}

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  reason: string;
}

export function estimateStrength(password: string): StrengthResult {
  if (!password) return { score: 0, label: "—", reason: "" };
  if (password.length < 6) return { score: 0, label: "Too short", reason: "Use at least 6 characters." };
  if (COMMON.has(password.toLowerCase()))
    return { score: 0, label: "Very weak", reason: "This is a commonly used password." };

  const len = password.length;
  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));

  let score = 0;
  // Length is the dominant factor.
  if (len >= 8) score++;
  if (len >= 12) score++;
  if (len >= 16) score++;
  // Variety helps once the length floor is met.
  if (classes >= 3 && len >= 8) score++;

  if (hasRepeats(password)) score = Math.max(0, score - 1);
  if (hasSequence(password)) score = Math.max(0, score - 1);

  score = Math.min(4, Math.max(0, score)) as 0 | 1 | 2 | 3 | 4;

  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;
  const reasons: string[] = [];
  if (len < 12) reasons.push("longer is stronger");
  if (classes < 3) reasons.push("mix upper, lower, numbers, symbols");
  if (hasRepeats(password)) reasons.push("avoid repeats");
  if (hasSequence(password)) reasons.push("avoid sequences like 1234");

  return {
    score,
    label: labels[score],
    reason: reasons.slice(0, 2).join(" · "),
  };
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, reason } = estimateStrength(password);

  const colors = ["#e11d48", "#f97316", "#f59e0b", "#16a34a", "#059669"];
  const color = colors[score];

  return (
    <div style={{ marginTop: 6 }}>
      <div
        aria-hidden
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 6,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 999,
              background: i < score ? color : "var(--border)",
              transition: "background 0.2s",
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 600, color }}>{label}</span>
        {reason && <span style={{ textAlign: "right" }}>{reason}</span>}
      </div>
    </div>
  );
}
