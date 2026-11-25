/** Types of the docs check, for the tests that import it. */

/** Splits source text into tokens and comments. */
export function lex(text: string): {
  tokens: { v: string; line: number; kind: string }[];
  comments: { start: number; end: number; line: number; endLine: number; doc: boolean; tokenIndex: number }[];
};
/** What is missing a comment in a source text, in file order. */
export function check(text: string): { line: number; what: string }[];
