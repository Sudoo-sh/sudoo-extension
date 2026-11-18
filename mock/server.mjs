// A local stand-in for a Sudoo.sh panel's API, for tests and for trying the extension without a real panel.
// It checks signatures exactly as docs/PANEL_API.md describes (token, 5-minute timestamp, single-use nonce, HMAC over
// the five or six lines) and answers with the panel's shapes, using the data of the panel's demo (web/src/demo).
//
//   npm run mock                      http://localhost:8787, write scope
//   node mock/server.mjs --scope instances --port 8788
//
// The token and signing secret below are test values of this mock only: they open nothing else.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

export const MOCK_TOKEN = "sudoo_mock_0123456789abcdef";
export const MOCK_SECRET = "mock-signing-secret-for-local-tests";

const OWNER = "example-integrator";
const PROJECTS = { "acme-retail": "Acme Retail", "nile-logistics": "Nile Logistics", "zahra-clinic": "Zahra Clinic" };
const SEEDS = [
  ["acme-retail", "main", "production", "18.0", "enterprise", "online"],
  ["acme-retail", "staging", "staging", "18.0", "enterprise", "online"],
  ["acme-retail", "pos-refunds", "development", "18.0", "enterprise", "online"],
  ["acme-retail", "loyalty-points", "development", "18.0", "enterprise", "paused"],
  ["nile-logistics", "main", "production", "17.0", "community", "online"],
  ["nile-logistics", "fleet-gps", "development", "17.0", "community", "online"],
  ["nile-logistics", "feature/upgrade-18", "development", "18.0", "community", "online"],
  ["zahra-clinic", "main", "production", "19.0", "enterprise", "online"],
  ["zahra-clinic", "appointments", "staging", "19.0", "enterprise", "online"],
  [null, null, "development", "19.0", "community", "switched_off"],
];
const BRANCHES = {
  "acme-retail": ["main", "staging", "pos-refunds", "loyalty-points", "gift-cards"],
  "nile-logistics": ["main", "fleet-gps", "feature/upgrade-18", "feature/customs-forms"],
  "zahra-clinic": ["main", "appointments", "lab-results"],
};
const ACTIONS = { start: "Start", pause: "Pause", restart: "Restart", update: "Get latest code", backup: "Back up" };
const JOB_MS = 4000;

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function seed() {
  const instances = new Map();
  for (const [repo, branch, stage, version, edition, status] of SEEDS) {
    const name = repo ? `${repo}-${slug(branch)}` : "odoo-19-0-community-7c2e";
    instances.set(name, makeInstance({ name, repo, branch, stage, version, edition, status }));
  }
  return instances;
}

function makeInstance({ name, repo, branch, stage, version, edition, status }) {
  return {
    name,
    status,
    stage,
    project: repo ? { id: repo, name: PROJECTS[repo], links: { self: `/api/v1/projects/${repo}` } } : null,
    url: `https://${name}.demo.sudoo.sh`,
    odoo: { version, edition, database: name.replace(/-/g, "_") },
    source: repo ? "repository" : "plain",
    git: {
      repository: repo ? `https://github.com/${OWNER}/${repo}` : null,
      branch: repo ? branch : null,
      branch_deleted_on_github: false,
      commit: repo ? { sha: "4f2a9c1", subject: "Add delivery report", author: "Sam", age: "2 hours ago" } : null,
    },
    settings: {
      auto_update: stage !== "production",
      auto_upgrade: true,
      auto_pause: stage !== "production",
      delete_after_days: stage === "production" ? 0 : 30,
    },
    created_at: iso(Date.now() - 86400000 * 3),
    current_job: null,
    links: { self: `/api/v1/instances/${name}` },
  };
}


const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };

/** Development only: the built extension under /ext/, and harness.html pages that load dev/shim.js first. */
function serveFile(dist, req, res) {
  const path = new URL(req.url, "http://mock").pathname.slice("/ext/".length);
  const root = resolve(dist);
  try {
    if (path === "dev-shim.js") {
      res.writeHead(200, { "Content-Type": TYPES[".js"] });
      return res.end(readFileSync(resolve(root, "../../dev/shim.js")));
    }
    const harness = /^(popup|options)\/harness\.html$/.exec(path);
    const file = harness ? join(root, harness[1], `${harness[1]}.html`) : normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error("outside");
    let body = readFileSync(file);
    if (harness) body = Buffer.from(String(body).replace("<script ", '<script src="../dev-shim.js"></script>\n    <script '));
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

export function createMockPanel({
  token = MOCK_TOKEN,
  secret = MOCK_SECRET,
  scope = "write",
  jobMs = JOB_MS,
  serve = null,
} = {}) {
  const instances = seed();
  const jobs = new Map();
  const nonces = new Map();
  let counter = 0;

  function jobView(job) {
    const elapsed = Date.now() - job.started;
    const done = elapsed >= jobMs;
    const steps = job.steps.map((title, i) => {
      const at = ((i + 1) * jobMs) / job.steps.length;
      return {
        title,
        status: done || elapsed >= at ? "done" : elapsed >= (i * jobMs) / job.steps.length ? "running" : "waiting",
      };
    });
    if (done && !job.finished) {
      job.finished = true;
      const instance = instances.get(job.instance);
      if (instance) {
        instance.current_job = null;
        instance.status = job.result;
      }
    }
    const failed = done && job.fail;
    return {
      id: job.id,
      instance: job.instance,
      action: job.action,
      status: done ? (failed ? "failed" : "success") : "running",
      progress_percent: done ? 100 : Math.min(99, Math.floor((elapsed / jobMs) * 100)),
      requested_by: `api:Mock token`,
      started_at: iso(job.started),
      finished_at: done ? iso(job.started + jobMs) : null,
      steps,
      notes: [],
      error: failed ? "Odoo did not answer after the restart." : null,
      links: { self: `/api/v1/jobs/${job.id}`, instance: `/api/v1/instances/${job.instance}` },
    };
  }

  function startJob(instance, action, steps, result, fail = false) {
    const id = (++counter).toString(16).padStart(12, "0");
    const job = { id, instance: instance.name, action, steps, started: Date.now(), result, fail, finished: false };
    jobs.set(id, job);
    const view = jobView(job);
    instance.current_job = {
      id,
      action,
      status: view.status,
      progress_percent: 0,
      steps: view.steps,
      links: view.links,
    };
    if (instance.status !== "creating") instance.status = "busy";
    return view;
  }

  function projectView(id) {
    const members = [...instances.values()].filter((i) => i.project?.id === id);
    const branchStage = (branch) => members.find((i) => i.git.branch === branch)?.stage ?? "development";
    const count = { total: BRANCHES[id].length, production: 0, staging: 0, development: 0 };
    for (const branch of BRANCHES[id]) count[branchStage(branch)] += 1;
    return {
      id,
      name: PROJECTS[id],
      repository: { full_name: `${OWNER}/${id}`, url: `https://github.com/${OWNER}/${id}` },
      odoo: { version: members[0]?.odoo.version ?? "19.0", edition: members[0]?.odoo.edition ?? "community" },
      origin: "adopted",
      created_at: iso(Date.now() - 86400000 * 70),
      created_by: "system",
      branches: count,
      instances: { total: members.length, by_status: {}, names: members.map((i) => i.name) },
      attention: [],
      production_branches: BRANCHES[id].filter((b) => branchStage(b) === "production"),
      links: { self: `/api/v1/projects/${id}` },
      branches_list: BRANCHES[id].map((name) => ({
        name,
        stage: branchStage(name),
        default: name === "main",
        on_github: true,
        commit: null,
        instances: members.filter((i) => i.git.branch === name).map((i) => i.name),
        auto_created: null,
      })),
    };
  }

  function createFor(repoId, branch, version, edition) {
    const name = `${repoId}-${slug(branch)}`;
    if (instances.has(name)) return { status: 409, problem: { title: "Conflict", detail: `${name} exists already.` } };
    const instance = makeInstance({
      name,
      repo: repoId,
      branch,
      stage: "development",
      version,
      edition,
      status: "creating",
    });
    instances.set(name, instance);
    const job = startJob(
      instance,
      "Create instance",
      ["Downloading the code", "Creating the database", "Starting Odoo"],
      "online",
    );
    return { status: 202, body: { data: job }, location: job.links.self, contentLocation: instance.links.self };
  }

  function verify(req, body) {
    const auth = req.headers.authorization ?? "";
    const ts = Number(req.headers["x-sudoo-timestamp"]);
    const nonce = String(req.headers["x-sudoo-nonce"] ?? "");
    const signature = String(req.headers["x-sudoo-signature"] ?? "");
    const actingFor = req.headers["x-sudoo-acting-for"];
    if (auth !== `Bearer ${token}`) return "The API token is not known or was revoked.";
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300)
      return "The timestamp is more than 5 minutes away.";
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return "The nonce is not valid.";
    const now = Date.now();
    for (const [n, at] of nonces) if (now - at > 300000) nonces.delete(n);
    if (nonces.has(nonce)) return "This nonce was used already.";
    const lines = [String(ts), nonce, req.method, req.url, sha256(body)];
    if (actingFor !== undefined) lines.push(String(actingFor));
    const expected = `sha256=${createHmac("sha256", secret).update(lines.join("\n")).digest("hex")}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return "The signature does not match the request.";
    nonces.set(nonce, now);
    return null;
  }

  function route(method, url, body) {
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const forbid = (what) => ({
      status: 403,
      problem: { title: "Forbidden", detail: `Your role cannot do this (${what}).` },
    });
    const notFound = { status: 404, problem: { title: "Not Found", detail: "No such resource." } };
    const writing = method !== "GET";
    if (scope === "read" && writing) return forbid("change anything with a read token");

    if (method === "GET" && path === "/server") {
      if (scope === "instances") return forbid("server");
      return { status: 200, body: { data: { version: "3.0.0", address: "http://localhost:8787" } } };
    }
    if (method === "GET" && path === "/instances") {
      const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 100));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const all = [...instances.values()];
      const page = all.slice(offset, offset + limit);
      return { status: 200, body: { data: page, meta: { total: all.length, count: page.length, limit, offset } } };
    }
    if (method === "POST" && path === "/instances") {
      const repoId = /github\.com\/[\w.-]+\/([\w.-]+)/.exec(body.repo ?? "")?.[1];
      if (!repoId || !BRANCHES[repoId])
        return { status: 400, problem: { title: "Bad Request", detail: "Enter a GitHub repository." } };
      return createFor(repoId, body.branch ?? "main", body.version ?? "19.0", body.edition ?? "community");
    }
    if (parts[0] === "instances" && parts[1]) {
      const instance = instances.get(parts[1]);
      if (!instance) return notFound;
      if (method === "GET" && parts.length === 2) return { status: 200, body: { data: instance } };
      if (method === "POST" && parts[2] === "actions" && parts[3]) {
        const action = parts[3];
        if (!ACTIONS[action]) return { status: 404, problem: { title: "Not Found", detail: "No such action." } };
        if (scope === "instances" && !["start", "pause", "restart", "backup"].includes(action)) return forbid(action);
        if (instance.current_job)
          return { status: 409, problem: { title: "Conflict", detail: `${instance.name} is busy.` } };
        if (instance.stage === "production" && action === "pause" && body.confirm_production !== true) {
          return {
            status: 400,
            problem: { title: "Bad Request", detail: "Confirm that you pause a production instance." },
          };
        }
        const result = action === "pause" ? "paused" : "online";
        const job = startJob(instance, ACTIONS[action], [`${ACTIONS[action]}`, "Checking Odoo"], result);
        return { status: 202, body: { data: job }, location: job.links.self };
      }
    }
    if (method === "GET" && path === "/jobs") {
      if (scope === "instances") return forbid("list jobs");
      const list = [...jobs.values()]
        .reverse()
        .slice(0, Number(url.searchParams.get("limit") ?? 30))
        .map(jobView);
      return { status: 200, body: { data: list, meta: { total: jobs.size } } };
    }
    if (method === "GET" && parts[0] === "jobs" && parts[1]) {
      const job = jobs.get(parts[1]);
      return job ? { status: 200, body: { data: jobView(job) } } : notFound;
    }
    if (parts[0] === "projects") {
      if (scope === "instances") return forbid("projects");
      if (method === "GET" && parts.length === 1) {
        const list = Object.keys(PROJECTS).map((id) => {
          const { branches_list: _, ...summary } = projectView(id);
          return summary;
        });
        return { status: 200, body: { data: list, meta: { standalone: ["odoo-19-0-community-7c2e"] } } };
      }
      const id = parts[1];
      if (!PROJECTS[id]) return notFound;
      if (method === "GET" && parts.length === 2) {
        return { status: 200, body: { data: projectView(id), meta: { default_branch: "main", branches_error: null } } };
      }
      if (method === "POST" && parts[2] === "branches" && parts.at(-1) === "instances") {
        const branch = parts.slice(3, -1).join("/");
        if (!BRANCHES[id].includes(branch))
          return { status: 404, problem: { title: "Not Found", detail: "GitHub has no such branch." } };
        const view = projectView(id);
        return createFor(id, branch, view.odoo.version, view.odoo.edition);
      }
    }
    if (method === "GET" && path === "/alerts") {
      if (scope !== "write") return forbid("audit log");
      return {
        status: 200,
        body: {
          data: [
            {
              id: "3f9c2a1b7d4e",
              key: "instance_down:acme-retail-loyalty-points",
              type: "instance_down",
              severity: "problem",
              title: "acme-retail-loyalty-points is down",
              text: "Instance acme-retail-loyalty-points is stopped, for 5 minutes now.",
              hint: null,
              details: [],
              instance: "acme-retail-loyalty-points",
              link: "/i/acme-retail-loyalty-points",
              at: 1794430123,
              last_at: 1794430123,
              count: 1,
              resolved_at: null,
              delivery: [],
            },
          ],
        },
      };
    }
    return notFound;
  }

  const server = createServer((req, res) => {
    if (serve && req.method === "GET" && req.url.startsWith("/ext/")) return serveFile(serve, req, res);
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      const requestId = `mock${(++counter).toString(16).padStart(8, "0")}`;
      const send = (status, payload, headers = {}) => {
        const problem = status >= 400;
        res.writeHead(status, {
          "Content-Type": problem ? "application/problem+json" : "application/json",
          "X-Request-ID": requestId,
          ...headers,
        });
        res.end(payload === null ? undefined : JSON.stringify(payload));
      };
      const refusal = verify(req, text);
      if (refusal)
        return send(401, {
          type: "about:blank",
          title: "Unauthorized",
          status: 401,
          detail: refusal,
          instance: req.url,
          request_id: requestId,
        });
      let body = {};
      if (text) {
        if (!String(req.headers["content-type"] ?? "").startsWith("application/json"))
          return send(415, { title: "Unsupported Media Type", status: 415 });
        try {
          body = JSON.parse(text);
        } catch {
          return send(400, { title: "Bad Request", status: 400, detail: "The body is not JSON." });
        }
      }
      const url = new URL(req.url, "http://mock");
      const answer = route(req.method, url, body);
      if (answer.problem)
        return send(answer.status, {
          type: "about:blank",
          status: answer.status,
          instance: url.pathname,
          request_id: requestId,
          ...answer.problem,
        });
      const headers = {};
      if (answer.location) headers.Location = answer.location;
      if (answer.contentLocation) headers["Content-Location"] = answer.contentLocation;
      send(answer.status, answer.body ?? null, headers);
    });
  });
  return { server, instances, jobs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const port = Number(arg("port", 8787));
  const scope = arg("scope", "write");
  const serve = process.argv.includes("--serve") ? resolve("dist/chrome") : null;
  createMockPanel({ scope, serve }).server.listen(port, "127.0.0.1", () => {
    console.log(`Mock Sudoo.sh panel (scope ${scope}) on http://localhost:${port}`);
    console.log(`API token:      ${MOCK_TOKEN}`);
    console.log(`Signing secret: ${MOCK_SECRET}`);
    if (serve) console.log(`Popup preview:  http://localhost:${port}/ext/popup/harness.html (?lang=ar, ?tab=<url>)`);
  });
}
