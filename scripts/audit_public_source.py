#!/usr/bin/env python3
"""High-confidence static guard; no production network or credentials required."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "source"
PATTERNS = {
    "private-key-pem": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----"),
    "github-token": re.compile(r"\b(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{20,}\b"),
    "live-provider-secret": re.compile(r"\bsk_live_[A-Za-z0-9]{12,}\b"),
    "long-email-credential": re.compile(r"(?i)(?:password|api_key|client_secret)\s*[=:]\s*['\"][A-Za-z0-9+/=_-]{32,}['\"]"),
}
PROHIBITED = {".env", ".pem", ".p12", ".pfx", ".sqlite3", ".db"}
EXCEPTIONS = {".env.example"}
issues = []
for path in sorted(TARGET.rglob("*")):
    if not path.is_file():
        continue
    if path.name in PROHIBITED or path.suffix in PROHIBITED:
        if path.name not in EXCEPTIONS:
            issues.append((path, "prohibited file type"))
        continue
    if path.suffix.lower() not in {".py", ".js", ".cjs", ".css", ".html", ".json", ".toml", ".ini", ".md", ".txt", ".sh", ".svg"}:
        continue
    content = path.read_text(encoding="utf-8")
    for label, pattern in PATTERNS.items():
        if pattern.search(content):
            issues.append((path, label))
if issues:
    for path, reason in issues:
        print(f"DENY: {path.relative_to(ROOT)} ({reason})")
    sys.exit(1)
print("PASS: high-confidence public-source secret-pattern guard")
