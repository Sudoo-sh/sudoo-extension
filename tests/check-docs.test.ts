/**
 * Tests of the docs check (scripts/check-docs.mjs): sources that pass, sources that fail and what is reported, the
 * tricky text it must not be fooled by (strings, templates, regular expressions, comments), and every real source
 * file: it passes, and it fails when a documented declaration loses its comment.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { check, lex } from "../scripts/check-docs.mjs";

/** The names of what is reported missing, for short assertions. */
function missing(text: string): string[] {
  return check(text).map((problem) => problem.what);
}

/** Every source file under the folders the check covers. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|mts|js|mjs)$/.test(entry) ? [path] : [];
  });
}

describe("the docs check: passes", () => {
  it("accepts a documented file", () => {
    const source = `/** The header. */

/** Adds. */
export function add(a: number, b: number): number {
  return a + b;
}

/** A shape. */
export interface Shape {
  /** The side. */
  side: number;
}

/** A name. */
export type Name = {
  /** The first. */
  first: string;
};

/** A limit. */
export const LIMIT = 3;
`;
    expect(check(source)).toEqual([]);
  });

  it("accepts a // header and a use strict directive before it", () => {
    expect(check("// A header.\n\n/** One. */\nexport const one = 1;\n")).toEqual([]);
    expect(check('"use strict";\n// A header.\n\n/** One. */\nexport const one = 1;\n')).toEqual([]);
  });

  it("is not fooled by comment-like text in strings, templates and regular expressions", () => {
    const source = `/** Header. */

/** Text. */
export const text = "/** not a comment */ function fake() {}";

/** Template. */
export const template = \`function fake() {} \${"}"} interface Fake { x: 1 }\`;

/** Pattern. */
export const pattern = /\\/\\*|function fake|[/}]/g;

/** Divides. */
export function half(n: number): number {
  return n / 2 / 1;
}
`;
    expect(check(source)).toEqual([]);
  });

  it("does not ask for comments inside function bodies or on imports and re-exports", () => {
    const source = `/** Header. */

import type { A } from "./a";
export { b } from "./b";
export * from "./c";

/** Runs. */
export function run(): void {
  const inner = 1;
  function helper() {}
  type Local = { x: number };
  helper();
  console.log(inner);
}
`;
    expect(check(source)).toEqual([]);
  });

  it("does not ask for private members, or fields of a union of objects", () => {
    const source = `/** Header. */

/** A client. */
export class Client {
  private readonly secret: string;
  /** The origin. */
  readonly origin: string;

  /** Create it. */
  constructor(origin: string) {
    this.origin = origin;
    this.secret = "x";
  }

  /** One call, with an object in its return type. */
  async call<T>(path: string): Promise<{ status: number; body: T | null }> {
    return { status: 200, body: null };
  }
}

/** Two shapes. */
export type Answer = { ok: true; id: string } | { ok: false };
`;
    expect(check(source)).toEqual([]);
  });

  it("reads generic fields as one field", () => {
    const source = `/** Header. */

/** A bag. */
export interface Bag {
  /** Anything. */
  meta?: Record<string, unknown>;
}
`;
    expect(check(source)).toEqual([]);
  });
});

describe("the docs check: fails", () => {
  it("reports a missing header, and a lone comment is the header and not the first declaration's", () => {
    expect(check("/** One. */\nexport const one = 1;\n")).toEqual([{ line: 2, what: "const one" }]);
    expect(check("export const one = 1;\n")).toEqual([
      { line: 1, what: "file header comment" },
      { line: 1, what: "const one" },
    ]);
  });

  it("reports a function, class, type, interface, enum and constant without a comment", () => {
    const source = `/** Header. */

export function a() {}
export async function b() {}
export class C {}
export type T = string;
export interface I {}
export enum E {}
export const k = 1;
const hidden = () => 1;
`;
    expect(missing(source)).toEqual([
      "function a",
      "function b",
      "class C",
      "type T",
      "interface I",
      "enum E",
      "const k",
      "const hidden",
    ]);
  });

  it("reports interface fields, object type fields and public class members", () => {
    const source = `/** Header. */

/** I. */
export interface I {
  one: string;
  /** Two. */
  two: number;
  three?: boolean;
}

/** T. */
export type T = {
  inner: string;
};

/** C. */
export class C {
  /** Fine. */
  readonly ok = 1;
  open = 2;
  go(): void {}
  private hidden = 3;
}
`;
    expect(missing(source)).toEqual(["field one", "field three", "field inner", "member open", "member go"]);
  });

  it("treats a plain // or /* */ comment as not a doc comment", () => {
    expect(missing("/** Header. */\n\n// not a doc\nexport const a = 1;\n")).toEqual(["const a"]);
    expect(missing("/** Header. */\n\n/* not a doc */\nexport const a = 1;\n")).toEqual(["const a"]);
  });

  it("reports line numbers", () => {
    const found = check("/** Header. */\n\n\nexport function late() {}\n");
    expect(found).toEqual([{ line: 4, what: "function late" }]);
  });
});

describe("the docs check: constructs", () => {
  const H = "/** Header. */\n\n";

  it("handles default, async and generator functions, overloads, arrows and decorators", () => {
    const source = `${H}/** A. */
export default async function named() {}

/** B. */
export function* gen() {}

/** C. */
export function pick(a: string): string;
export function pick(a: number): number;
export function pick(a: unknown) {
  return a;
}

/** D. */
export const arrow = async (x: number) => x;

/** E. */
@sealed()
export class Decorated {
  /** F. */
  @tracked() value = 1;
}

/** G. */
export const enum Level {
  Low,
}
`;
    expect(check(source)).toEqual([]);
  });

  it("asks for a comment on each of these, and names them", () => {
    const source = `${H}export default function () {}
export const { a, b } = values;
export const [c, d] = list;
export const first = 1, second = 2;
export function* gen() {}
export function pick(a: string): string;
export function other() {}
`;
    expect(missing(source)).toEqual([
      "function (default export)",
      "const (destructured)",
      "const (destructured)",
      "const first",
      "function gen",
      "function pick",
      "function other",
    ]);
  });

  it("leaves out mapped types, static blocks and what is inside a function body", () => {
    const source = `${H}/** M. */
export type Mapped = { [K in keyof Shape]: Shape[K] };

/** C. */
export class C {
  static {
    init();
  }
}
`;
    expect(check(source)).toEqual([]);
  });

  it("accepts a shebang line, a byte order mark, an empty file and a file of only a header", () => {
    expect(check("#!/usr/bin/env node\n/** H. */\n\n/** x */\nexport const a = 1;\n")).toEqual([]);
    expect(check("\uFEFF/** H. */\n\n/** x */\nexport const a = 1;\n")).toEqual([]);
    expect(check("")).toEqual([]);
    expect(check("/** H. */\n")).toEqual([]);
  });

  it("asks for a header after a shebang when there is none", () => {
    expect(missing("#!/usr/bin/env node\nexport const a = 1;\n")).toContain("file header comment");
  });
});

describe("the docs check: malformed input", () => {
  const H = "/** Header. */\n\n";

  it("fails closed on what it cannot read to the end", () => {
    const broken = [
      "/* never closed\n",
      "const a = 'never closed\n",
      ["const a = `never closed $", "{ x\n"].join(""),
      "const a = `never closed\n",
      "const a = /never closed\n",
      "function f( {\n",
      "}}\n",
      "interface I { a: string;\n",
    ];
    for (const source of broken) {
      const found = check(H + source);
      expect(found.length, source).toBeGreaterThan(0);
      expect(
        found.every((problem) => problem.what.startsWith("cannot check")),
        source,
      ).toBe(true);
    }
  });

  it("neither throws nor hangs on any truncation of the real sources", () => {
    const started = Date.now();
    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      for (let cut = 1; cut < text.length; cut += Math.max(1, Math.floor(text.length / 40)))
        expect(Array.isArray(check(text.slice(0, cut)))).toBe(true);
    }
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("the lexer", () => {
  it("separates comments from code and tells doc comments apart", () => {
    const { tokens, comments } = lex("// a\n/* b */\n/** c */\nconst x = 1;\n");
    expect(comments.map((comment) => comment.doc)).toEqual([false, false, true]);
    expect(tokens.map((token) => token.v)).toEqual(["const", "x", "=", "1", ";"]);
  });

  it("keeps a template with an expression in order", () => {
    const { tokens } = lex(["const a = `x $", "{y + `z`} w`;\nconst b = 1;\n"].join(""));
    expect(tokens.filter((token) => token.kind === "id").map((token) => token.v)).toEqual([
      "const",
      "a",
      "y",
      "const",
      "b",
    ]);
  });
});

describe("the real sources", () => {
  const files = ["src", "tests", "scripts", "mock", "dev"].flatMap((dir) => sourceFiles(dir));

  it("are all documented", () => {
    for (const file of files) expect({ file, found: check(readFileSync(file, "utf8")) }).toEqual({ file, found: [] });
  });

  it("fail when the comment above a declaration is removed, in every file that has one", () => {
    let checked = 0;
    for (const file of files.filter((name) => !name.endsWith("check-docs.test.ts"))) {
      const text = readFileSync(file, "utf8");
      // the first doc comment that sits directly above an export or a field: removing it must be reported
      const match = /\n[ \t]*\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n(?=[ \t]*(?:export |[a-zA-Z_]+\??:))/.exec(text);
      if (!match) continue;
      checked++;
      const without = text.replace(match[0], "\n");
      expect(check(without).length, file).toBeGreaterThan(0);
    }
    expect(checked).toBeGreaterThan(15);
  });
});
