# Contributing

Thank you for helping. The steps are short:

1. Fork the repository and make a branch from `main`.
2. Run `npm ci` once, then `pre-commit install`.
3. Make the change, with a test when it changes behaviour.
4. Run `npm run check` (lint, types, the docs check, the tests and the build). It must pass.
5. Open a pull request that says what changed and why.

Sign off each commit (`git commit -s`): it says you wrote the change or have the right to submit it
([Developer Certificate of Origin](https://developercertificate.org/)).

## Documentation rule

Every change keeps the code documented. A change is not finished until:

- Every source file starts with a header comment: what the file is for and how it fits in.
- Every exported function, class, type, interface, enum and constant, and every field of an interface or class, has a
  `/** ... */` comment right above it. For a function: what it does, its inputs (`@param`), what it gives back
  (`@returns`), the errors it throws (`@throws`) and its side effects (storage written, requests sent).
- A private helper that is not obvious has the same kind of comment.
- Comments explain why, not what the next line does. Plain English, short sentences.

`node scripts/check-docs.mjs` checks that the comments exist; it runs in `npm run lint`, in `npm run check` and in
the pre-commit hook. It cannot tell a good comment from a poor one: the review does that.
