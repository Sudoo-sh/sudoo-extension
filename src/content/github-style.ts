/** The GitHub box's styles: the panel's tokens (web/src/styles/_tokens.scss), scoped to the shadow root. */
export const CONTENT_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.pill, .card {
  --accent: #714b67; --on-accent: #fff; --surface: #fff; --raised: #f4f4f5; --text: #171717; --text-2: #525252;
  --text-3: #737373; --hairline: rgb(23 23 23 / .08); --hairline-strong: rgb(23 23 23 / .14);
  --positive: #16a34a; --negative: #dc2626; --caution: #b45309; --working: #2563eb; --idle: #a3a3a3;
  --shadow: 0 8px 24px rgb(0 0 0 / .08), 0 1px 2px rgb(0 0 0 / .04);
  --ease: cubic-bezier(0.23, 1, 0.32, 1);
  position: fixed; inset-block-end: 16px; inset-inline-end: 16px; z-index: 2147483000;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "IBM Plex Sans Arabic", "Inter", "Segoe UI", system-ui, sans-serif;
  color: var(--text); -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .pill, .card {
    --accent: #c79bbd; --on-accent: #1b1219; --surface: #19191b; --raised: #232325; --text: #ededed; --text-2: #a1a1a6;
    --text-3: #85858b; --hairline: rgb(237 237 237 / .08); --hairline-strong: rgb(237 237 237 / .14);
    --positive: #4cc38a; --negative: #e5484d; --caution: #e0a33d; --working: #6c9ef5; --idle: #6b6b70;
    --shadow: 0 12px 32px rgb(0 0 0 / .5);
  }
}
.ring { stroke: var(--accent); } .ink { fill: var(--accent); }
button { font: inherit; color: inherit; cursor: pointer; }
.pill {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--hairline-strong); box-shadow: var(--shadow); font-weight: 600;
  transition: transform 160ms var(--ease);
}
.pill:active, .button:active { transform: scale(0.97); }
.card {
  width: 320px; max-height: min(70vh, 520px); overflow: auto; padding: 12px; border-radius: 14px;
  background: var(--surface); border: 1px solid var(--hairline-strong); box-shadow: var(--shadow);
  transform-origin: bottom right; transition: opacity 240ms var(--ease), transform 240ms var(--ease);
}
:host([dir="rtl"]) .card { transform-origin: bottom left; }
@starting-style { .card { opacity: 0; transform: translateY(6px) scale(0.98); } }
header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
header strong { flex: 1; font-size: 13px; }
.icon { border: 0; background: none; width: 24px; height: 24px; border-radius: 6px; font-size: 18px; line-height: 1; color: var(--text-3); }
.icon:hover { background: var(--raised); }
.match + .match { border-top: 1px solid var(--hairline); margin-top: 10px; padding-top: 10px; }
.panel { font-size: 12px; color: var(--text-3); margin-bottom: 4px; }
.branch { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; min-width: 0; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.instance { padding: 8px; border-radius: 8px; background: var(--raised); margin-top: 6px; }
.row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.name { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { color: var(--text-2); font-size: 12px; margin: 2px 0 6px 14px; }
:host([dir="rtl"]) .status { margin: 2px 14px 6px 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--idle); }
.dot.online { background: var(--positive); } .dot.working { background: var(--working); } .dot.paused { background: var(--caution); }
.stage { flex: none; font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 6px; background: var(--surface); border: 1px solid var(--hairline-strong); color: var(--text-2); }
.stage.production { color: var(--accent); border-color: color-mix(in oklab, var(--accent) 40%, transparent); }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.button {
  display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 8px; text-decoration: none;
  font-size: 12px; font-weight: 600; border: 1px solid var(--hairline-strong); background: var(--surface); color: var(--text);
  transition: transform 160ms var(--ease);
}
.button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.button:focus-visible, .pill:focus-visible, .icon:focus-visible, .link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.note { margin: 6px 0; color: var(--text-2); font-size: 12px; }
.note.error { color: var(--negative); }
.create { margin-top: 8px; }
.bar { height: 4px; border-radius: 2px; background: var(--raised); overflow: hidden; }
.fill { display: block; height: 100%; background: var(--accent); transform: scaleX(0.04); transform-origin: left; transition: transform 400ms var(--ease); }
:host([dir="rtl"]) .fill { transform-origin: right; }
footer { margin-top: 10px; }
.link { border: 0; background: none; padding: 0; color: var(--text-3); font-size: 12px; text-decoration: underline; }
@media (prefers-reduced-motion: reduce) { .card, .pill, .button, .fill { transition: none; } }
`;
