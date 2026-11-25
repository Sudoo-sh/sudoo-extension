// Checks that the code is documented: every source file starts with a header comment, and every function, class,
// type, interface, enum and constant declared at the top of a file, and every field of an interface, object type or
// class, has a /** ... */ comment right above it.
//
// A small lexer (comments, strings, template literals and regular expressions are told apart from code) and a
// declaration scanner, with no dependencies, so it runs in the pre-commit hook and in `npm run check`. It is not a
// TypeScript parser: it does not prove a file is valid, `tsc` does that. It reads the layout biome produces (one
// member per line or ending in ; or ,), and it checks that a comment exists, not that it is good.
//
// What it covers: top-level function (also default, async, generator and overloads: the first signature carries the
// comment), class, interface, type, enum, const, let and var (also destructured, and with decorators in front), and
// the fields and public members described above. One comment covers one statement, so `const a = 1, b = 2;` needs
// one. What it leaves out, on purpose: private members, fields of a union or intersection of object types, mapped
// types, static blocks, the inside of namespaces and `declare module` blocks, `export default <expression>`, and
// anything inside a function body. A file it cannot read to the end (an unterminated comment, string, template or
// regular expression, or brackets that do not match) is reported as an error and not checked any further: the check
// fails closed.
//
// Usage: node scripts/check-docs.mjs [files...]   (no files: every source file under src, tests, scripts, mock, dev)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The folders whose source files are checked. */
const ROOTS = ["src", "tests", "scripts", "mock", "dev"];
/** The file names that count as source. */
const SOURCE = /\.(?:ts|tsx|mts|js|mjs)$/;

/** Words after which a "/" starts a regular expression and not a division. */
const REGEX_AFTER = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

/**
 * Splits source text into tokens and comments.
 * @param {string} text the file's text
 * @returns {{ errors: { line: number; what: string }[]; tokens: { v: string; line: number; kind: string }[]; comments: { start: number; end: number; line: number; endLine: number; doc: boolean; tokenIndex: number }[] }}
 *   tokens: identifiers, numbers, strings (one token each, kind "str"), regular expressions (kind "re"), and punctuation;
 *   comments: each with the index of the token that follows it
 */
export function lex(text) {
  const tokens = [];
  const comments = [];
  /** What could not be read: an unterminated comment, string, template or regular expression, or unbalanced brackets. */
  const errors = [];
  /** The brackets opened and not yet closed. */
  const open = [];
  let i = 0;
  let line = 1;
  const n = text.length;
  /** the brace depths that mean "back inside a template literal" */
  const templateStack = [];
  let braceDepth = 0;

  const push = (v, kind) => tokens.push({ v, line, kind });
  const regexAllowed = () => {
    const last = tokens[tokens.length - 1];
    if (!last) return true;
    if (last.kind === "id") return REGEX_AFTER.has(last.v);
    if (last.kind === "num" || last.kind === "str" || last.kind === "re") return false;
    return ![")", "]", "}"].includes(last.v);
  };
  /** Reads a template literal's text from just after a backtick or a closing brace. Returns when `${` or the end is reached. */
  const readTemplate = () => {
    while (i < n) {
      const c = text[i];
      if (c === "\\") {
        if (text[i + 1] === "\n") line++;
        i += 2;
        continue;
      }
      if (c === "\n") line++;
      if (c === "`") {
        i++;
        push("`", "str");
        return;
      }
      if (c === "$" && text[i + 1] === "{") {
        i += 2;
        templateStack.push(braceDepth);
        braceDepth++;
        push("`${", "str");
        return;
      }
      i++;
    }
    errors.push({ line, what: "unterminated template literal" });
  };

  while (i < n) {
    const c = text[i];
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "#" && i === 0 && text[1] === "!") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      const start = i;
      while (i < n && text[i] !== "\n") i++;
      comments.push({ start, end: i, line, endLine: line, doc: false, tokenIndex: tokens.length });
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const start = i;
      const startLine = line;
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") line++;
        i++;
      }
      if (i >= n) errors.push({ line: startLine, what: "unterminated comment" });
      i += 2;
      comments.push({
        start,
        end: i,
        line: startLine,
        endLine: line,
        doc: text[start + 2] === "*" && text[start + 3] !== "/",
        tokenIndex: tokens.length,
      });
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && text[i] !== c && text[i] !== "\n") {
        if (text[i] === "\\" && text[i + 1] === "\n") line++;
        i += text[i] === "\\" ? 2 : 1;
      }
      if (i >= n || text[i] === "\n") errors.push({ line, what: "unterminated string" });
      i++;
      push(c, "str");
      continue;
    }
    if (c === "`") {
      i++;
      readTemplate();
      continue;
    }
    if (c === "/" && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < n && text[i] !== "\n") {
        if (text[i] === "\\") i++;
        else if (text[i] === "[") inClass = true;
        else if (text[i] === "]") inClass = false;
        else if (text[i] === "/" && !inClass) break;
        i++;
      }
      if (i >= n || text[i] === "\n") errors.push({ line, what: "unterminated regular expression" });
      i++;
      while (i < n && /[a-z]/i.test(text[i])) i++;
      push("/re/", "re");
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const start = i;
      while (i < n && /[\w$]/.test(text[i])) i++;
      push(text.slice(start, i), "id");
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i;
      while (i < n && /[\w.]/.test(text[i])) i++;
      push(text.slice(start, i), "num");
      continue;
    }
    if (c === "{") braceDepth++;
    if (c === "}") {
      braceDepth--;
      if (templateStack.length > 0 && templateStack[templateStack.length - 1] === braceDepth) {
        templateStack.pop();
        i++;
        readTemplate();
        continue;
      }
    }
    if (c === "{" || c === "(" || c === "[") open.push({ c, line });
    else if (c === "}" || c === ")" || c === "]") {
      const last = open.pop();
      if (!last || "{([".indexOf(last.c) !== "})]".indexOf(c)) errors.push({ line, what: `unbalanced ${c}` });
    }
    if (c === "=" && text[i + 1] === ">") {
      i += 2;
      push("=>", "p");
      continue;
    }
    i++;
    push(c, "p");
  }
  if (templateStack.length > 0) errors.push({ line, what: "unterminated template literal" });
  for (const left of open) errors.push({ line: left.line, what: `unclosed ${left.c}` });
  return { errors, tokens, comments };
}

/** Opening brackets. */
const OPEN = new Set(["{", "(", "["]);
/** Closing brackets. */
const CLOSE = new Set(["}", ")", "]"]);
/** Words that can come before a declaration's keyword. */
const MODIFIERS = new Set(["export", "default", "declare", "async", "abstract"]);
/** Words that can come before a class member's name. Private members are not checked. */
const MEMBER_MODIFIERS = new Set([
  "public",
  "private",
  "protected",
  "static",
  "readonly",
  "override",
  "abstract",
  "declare",
  "accessor",
  "async",
]);

/**
 * Finds what is missing a comment.
 * @param {string} text the file's text
 * @returns {{ line: number; what: string }[]} one entry per missing comment, in file order
 */
export function check(text) {
  const { errors, tokens, comments } = lex(text.replace(/^\uFEFF/, ""));
  const problems = [];
  // fail closed: a file that cannot be read to the end is reported and not checked any further
  if (errors.length > 0) return errors.map((error) => ({ line: error.line, what: `cannot check, ${error.what}` }));
  const docBefore = new Map();
  // the last comment before a token is the one that counts: it must be a doc comment
  for (const comment of comments) docBefore.set(comment.tokenIndex, comment);
  for (const [index, comment] of docBefore) if (!comment.doc) docBefore.delete(index);
  const hasDoc = (index) => docBefore.has(index);

  // The header comes before the first statement (after any "use strict" directive). When the first statement is a
  // declaration it needs its own comment as well, so one comment alone is the header and not that declaration's.
  let top = 0;
  while (tokens[top]?.kind === "str" && tokens[top + 1]?.v === ";") top += 2;
  if (tokens.length > 0) {
    const atTop = comments.filter((comment) => comment.tokenIndex <= top);
    if (atTop.length === 0) problems.push({ line: tokens[top].line, what: "file header comment" });
    else if (
      atTop.filter((comment) => comment.tokenIndex === top).length === 1 &&
      atTop[atTop.length - 1].tokenIndex === top
    )
      docBefore.delete(top);
  }

  /** Index of the token that closes the bracket opened at `open`. */
  const closeOf = (open) => {
    let depth = 0;
    for (let k = open; k < tokens.length; k++) {
      const v = tokens[k].kind === "p" ? tokens[k].v : "";
      if (OPEN.has(v)) depth++;
      else if (CLOSE.has(v) && --depth === 0) return k;
    }
    return tokens.length - 1;
  };

  /** The index of the token after the member that starts at `k`: past its ; or , at this depth, or past the } of a method body (a } followed by a new line). */
  const nextMember = (k, end, isClass) => {
    let depth = 0;
    let angle = 0;
    let j = k;
    for (; j < end; j++) {
      const t = tokens[j];
      const v = t.kind === "p" ? t.v : "";
      if (OPEN.has(v)) depth++;
      else if (CLOSE.has(v)) {
        depth--;
        if (
          depth === 0 &&
          v === "}" &&
          isClass &&
          tokens[j + 1] &&
          tokens[j + 1].line > t.line &&
          tokens[j + 1].v !== "{"
        )
          break;
      } else if (depth === 0 && v === "<") angle++;
      else if (depth === 0 && v === ">") angle--;
      else if (depth === 0 && angle <= 0 && (v === ";" || v === ",")) break;
    }
    return j + 1;
  };

  /** Checks the members of a `{ ... }` body: interface, object type or class. */
  const members = (open, isClass) => {
    const end = closeOf(open);
    let k = open + 1;
    while (k < end) {
      const start = k;
      // skip member modifiers so the comment is found above the whole member
      let name = k;
      while (tokens[name].v === "@" && tokens[name + 1]) {
        name += 2;
        if (tokens[name]?.v === "(") name = closeOf(name) + 1;
      }
      // a static block ("static { ... }") and a mapped type ("[K in T]: ...") have nothing to document
      if (isClass && tokens[name].v === "static" && tokens[name + 1]?.v === "{") {
        k = closeOf(name + 1) + 1;
        continue;
      }
      if (!isClass && tokens[name].v === "[" && tokens.slice(name, closeOf(name)).some((t) => t.v === "in")) {
        k = nextMember(k, end, false);
        continue;
      }
      while (
        tokens[name].kind === "id" &&
        MEMBER_MODIFIERS.has(tokens[name].v) &&
        name + 1 < end &&
        ![":", "(", "=", ";", "?", "<"].includes(tokens[name + 1].v)
      )
        name++;
      const label = tokens[name].v === "[" ? "[...]" : tokens[name].v;
      const isPrivate = isClass && (tokens.slice(start, name).some((t) => t.v === "private") || tokens[name].v === "#");
      if (!isPrivate && !hasDoc(start) && !(tokens[start].v === "}" || tokens[start].v === ";"))
        problems.push({ line: tokens[start].line, what: `${isClass ? "member" : "field"} ${label}` });
      k = nextMember(k, end, isClass);
    }
    return end;
  };

  /** The index just past the end of a statement that starts at `k`: after a ; at depth 0, or after a } closing a body. */
  const statementEnd = (k) => {
    let depth = 0;
    for (let j = k; j < tokens.length; j++) {
      const t = tokens[j];
      const v = t.kind === "p" ? t.v : "";
      if (OPEN.has(v)) depth++;
      else if (CLOSE.has(v)) {
        depth--;
        if (depth === 0 && v === "}" && endsBlock(k, j)) return j + 1;
      } else if (depth === 0 && v === ";") return j + 1;
    }
    return tokens.length;
  };

  /** Whether a statement that starts at `start` and has a } at `at` ends there (a function, class or interface body). */
  const endsBlock = (start, at) => {
    let k = start;
    while (MODIFIERS.has(tokens[k]?.v)) k++;
    const word = tokens[k]?.v;
    if (
      ![
        "function",
        "class",
        "interface",
        "enum",
        "namespace",
        "module",
        "if",
        "for",
        "while",
        "try",
        "switch",
      ].includes(word)
    )
      return false;
    return closeOfBodyAt(start) === at;
  };

  /** For function, class, interface and enum statements: the index of the } that closes the body (the first { at depth 0 of the head). */
  const closeOfBodyAt = (start) => {
    let depth = 0;
    for (let k = start; k < tokens.length; k++) {
      const v = tokens[k].kind === "p" ? tokens[k].v : "";
      if (v === "{" && depth === 0 && !isTypeBrace(k)) return closeOf(k);
      if (v === "(" || v === "[" || v === "<") depth++;
      else if (v === ")" || v === "]" || v === ">") depth--;
    }
    return tokens.length - 1;
  };

  /** A { in a head that is a type (a return type or a generic constraint), not the body: it follows ":" or "extends" or "|" or "&" or "=>" . */
  const isTypeBrace = (k) => {
    const prev = tokens[k - 1]?.v;
    return prev === ":" || prev === "|" || prev === "&" || prev === "<" || prev === "," || prev === "=>";
  };

  /** The name of the function declared just before, so overload signatures are not asked for a comment each. */
  let lastFunction = null;
  let k = 0;
  while (k < tokens.length) {
    const start = k;
    let at = k;
    // decorators ("@name" or "@name(...)") come before the declaration and share its comment
    while (tokens[at]?.v === "@" && tokens[at + 1]) {
      at += 2;
      while (tokens[at]?.v === "." && tokens[at + 1]) at += 2;
      if (tokens[at]?.v === "(") at = closeOf(at) + 1;
    }
    while (MODIFIERS.has(tokens[at]?.v) && tokens[at]?.kind === "id") at++;
    const word = tokens[at]?.v;
    const next = tokens[at + 1]?.v;
    let what = null;
    let body = null;
    if (word === "function") {
      const name = next === "*" ? tokens[at + 2]?.v : next;
      what = `function ${name === "(" ? "(default export)" : name}`;
    } else if (word === "class") {
      what = `class ${next === "{" || next === "extends" ? "(default export)" : next}`;
    } else if (word === "interface") {
      what = `interface ${next}`;
    } else if (word === "enum") {
      what = `enum ${next}`;
    } else if (word === "type" && tokens[at + 1]?.kind === "id" && tokens[start].v !== "import") {
      what = `type ${next}`;
    } else if (word === "const" && next === "enum") {
      what = `enum ${tokens[at + 2]?.v}`;
    } else if (word === "const" || word === "let" || word === "var") {
      what = `${word} ${tokens[at + 1]?.v === "{" || tokens[at + 1]?.v === "[" ? "(destructured)" : next}`;
    } else if (
      word === "import" ||
      (word === "export" &&
        (next === "{" || next === "*" || (tokens[at + 1]?.v === "type" && tokens[at + 2]?.v === "{")))
    ) {
      k = statementEnd(start);
      continue;
    }
    if (!what) {
      k = statementEnd(start);
      if (k <= start) k = start + 1;
      continue;
    }
    // overload signatures of a function share the first one's comment
    const overload = word === "function" && what === lastFunction;
    lastFunction = word === "function" ? what : null;
    if (!overload && !hasDoc(start)) problems.push({ line: tokens[start].line, what });
    // fields: the first { of an interface or class head, or the { right after "type X =" (an object type)
    if (word === "interface" || word === "class") {
      let j = at;
      let depth = 0;
      for (; j < tokens.length; j++) {
        const v = tokens[j].kind === "p" ? tokens[j].v : "";
        if (v === "(" || v === "[" || v === "<") depth++;
        else if (v === ")" || v === "]" || v === ">") depth--;
        else if (v === "{" && depth <= 0) break;
      }
      if (j < tokens.length) body = j;
    } else if (word === "type") {
      let j = at;
      while (j < tokens.length && tokens[j].v !== "=" && tokens[j].v !== ";") j++;
      // only a type that is one object: a union or intersection of objects has no fields of its own to document
      if (tokens[j]?.v === "=" && tokens[j + 1]?.v === "{" && !["|", "&"].includes(tokens[closeOf(j + 1) + 1]?.v))
        body = j + 1;
    }
    if (body !== null && tokens[body]?.v === "{") members(body, word === "class");
    k = statementEnd(start);
    if (k <= start) k = start + 1;
  }
  return problems;
}

/** The source files under the roots, in path order. */
function sources(dir) {
  const found = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (SOURCE.test(entry)) found.push(path);
  }
  return found;
}

/** Whether a path is one this check covers: a source file below one of the roots. */
function covered(path) {
  const parts = resolve(path)
    .slice(process.cwd().length + 1)
    .split(sep);
  return ROOTS.includes(parts[0]) && SOURCE.test(path);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const given = process.argv.slice(2);
  const files = given.length > 0 ? given.filter(covered) : ROOTS.flatMap((root) => sources(root));
  let count = 0;
  for (const file of files) {
    for (const problem of check(readFileSync(file, "utf8"))) {
      console.error(`${file}:${problem.line}: missing comment: ${problem.what}`);
      count++;
    }
  }
  if (count > 0) {
    console.error(`${count} missing comment${count === 1 ? "" : "s"} in ${files.length} files.`);
    process.exit(1);
  }
  console.log(`Docs check: ${files.length} files, every file, function, class, type and field has a comment.`);
}
