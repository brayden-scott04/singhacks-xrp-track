const EXTENSION_BY_LANGUAGE: Record<string, string> = {
  python: "py",
  py: "py",
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  jsx: "jsx",
  tsx: "tsx",
  json: "json",
  html: "html",
  css: "css",
  java: "java",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  csharp: "cs",
  cs: "cs",
  go: "go",
  rust: "rs",
  rs: "rs",
  ruby: "rb",
  rb: "rb",
  php: "php",
  sql: "sql",
  bash: "sh",
  sh: "sh",
  shell: "sh",
  yaml: "yaml",
  yml: "yaml",
  markdown: "md",
  md: "md",
  csv: "csv",
  xml: "xml",
  text: "txt",
  plaintext: "txt",
  txt: "txt",
};

const CODE_FENCE = /```([\w+-]*)\n([\s\S]*?)```/g;

export interface DetectedOutputFile {
  filename: string;
  content: string;
}

function slugify(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-");
  return slug.length > 0 ? slug.slice(0, 48) : fallback;
}

const MIN_FENCE_CONTENT_LENGTH = 3;

// Language tags that mark a fence as incidental (a "run it like this" command
// or a captured terminal/example output) rather than the deliverable itself.
// An empty tag (bare ``` ```) is just as often an example-output block as an
// actual file, so it's treated the same way.
const INSTRUCTIONAL_LANGUAGES = new Set(["", "bash", "sh", "shell", "text", "plaintext", "txt", "console", "output"]);

function isCodeFence(lang: string): boolean {
  return !INSTRUCTIONAL_LANGUAGES.has(lang);
}

function fenceFile(prompt: string, fences: RegExpMatchArray[]): DetectedOutputFile {
  if (fences.length === 1) {
    const lang = fences[0][1]?.toLowerCase() ?? "";
    const ext = EXTENSION_BY_LANGUAGE[lang] ?? "txt";
    return { filename: `${slugify(prompt, "bidstream-output")}.${ext}`, content: fences[0][2].trim() };
  }
  const content = fences.map((m) => m[2].trim()).join("\n\n");
  return { filename: `${slugify(prompt, "bidstream-output")}.md`, content };
}

/**
 * Deterministic, local-only detector for "the model's answer contains a
 * file, not just prose" — mirrors complexity.ts/relevance.ts's regex-only
 * style, no extra API call and no LLM judgment call involved.
 *
 * A real answer almost always wraps the deliverable in explanatory prose
 * *and* incidental fences of its own — "Here's a Python file...\n\n```python
 * ...\n```\n\n### How to Use\n\n```bash\npython square_calculator.py\n```\n\n
 * ### Example Output\n```\n...\n```" is typical: one real code fence plus a
 * shell-command fence and an untagged example-output fence that are not
 * files the model intended to hand back. So fences with an instructional/
 * output-like language tag (see INSTRUCTIONAL_LANGUAGES) are only used when
 * there is no genuine code fence to prefer instead — otherwise they're
 * dropped entirely, both from the extension decision and from the
 * downloaded content. Multiple genuine code fences (e.g. one HTML file plus
 * one CSS file) are bundled together since dropping all but one would
 * silently lose a file the model clearly intended to hand back. Only when
 * there is no fence at all does standalone JSON count.
 */
export function detectOutputFile(prompt: string, output: string): DetectedOutputFile | null {
  const trimmed = output.trim();
  if (trimmed.length === 0) return null;

  const fences = [...trimmed.matchAll(CODE_FENCE)].filter((m) => m[2].trim().length >= MIN_FENCE_CONTENT_LENGTH);
  const codeFences = fences.filter((m) => isCodeFence(m[1]?.toLowerCase() ?? ""));

  if (codeFences.length > 0) return fenceFile(prompt, codeFences);
  if (fences.length > 0) return fenceFile(prompt, fences);

  try {
    JSON.parse(trimmed);
    return { filename: `${slugify(prompt, "bidstream-output")}.json`, content: trimmed };
  } catch {
    return null;
  }
}
