/** Tests of how the GitHub page box is built from the panel's data (src/lib/github.ts). */

import { describe, expect, it } from "vitest";
import { buildMatch, versionFor } from "../src/lib/github";
import type { Instance, Project, ProjectDetail } from "../src/lib/types";

/** A panel as the extension stores it: id, label and origin. */
const panel = { id: "p1", label: "Acme server", origin: "https://panel.example.com" };
/** A project with its repository and Odoo version. */
const project: Project = {
  id: "erp",
  name: "ERP",
  repository: { full_name: "acme/erp", url: "https://github.com/acme/erp" },
  odoo: { version: "19.0", edition: "enterprise" },
};
/**
 * A project's detail with three branches (main with an instance, one without, one deleted on GitHub) and the default
 * branch.
 */
const detail: { project: ProjectDetail; defaultBranch: string } = {
  project: {
    ...project,
    branches_list: [
      { name: "main", stage: "production", default: true, on_github: true, instances: ["erp-main"] },
      { name: "feature/x", stage: "development", default: false, on_github: true, instances: [] },
      { name: "gone", stage: "development", default: false, on_github: false, instances: [] },
    ],
  },
  defaultBranch: "main",
};
/** The production instance of the main branch. */
const main: Instance = {
  name: "erp-main",
  status: "online",
  stage: "production",
  project: { id: "erp", name: "ERP" },
  url: "https://erp-main.example.com",
  odoo: { version: "19.0", edition: "enterprise" },
  git: { repository: "https://github.com/acme/erp", branch: "main" },
  current_job: null,
};

/** Test group for buildMatch and versionFor. */
describe("the GitHub box", () => {
  it("shows the branch's instance on a tree page", () => {
    const match = buildMatch(
      panel,
      { repo: "acme/erp", kind: "tree", ref: "main/addons", head: null },
      [main],
      project,
      detail,
    );
    expect(match).toMatchObject({ branch: "main", branchStage: "production", canCreate: false, fork: false });
    expect(match?.instances[0]).toMatchObject({ name: "erp-main", panelUrl: "https://panel.example.com/i/erp-main" });
    expect(match?.project?.url).toBe("https://panel.example.com/projects/erp");
  });

  it("offers a development instance for a branch without one", () => {
    const match = buildMatch(
      panel,
      { repo: "acme/erp", kind: "tree", ref: "feature/x/README.md", head: null },
      [main],
      project,
      detail,
    );
    expect(match).toMatchObject({ branch: "feature/x", branchStage: "development", canCreate: true, instances: [] });
  });

  it("does not offer one for a branch GitHub no longer has", () => {
    const match = buildMatch(
      panel,
      { repo: "acme/erp", kind: "tree", ref: "gone", head: null },
      [main],
      project,
      detail,
    );
    expect(match?.canCreate).toBe(false);
  });

  it("uses the default branch on the repository's home page", () => {
    expect(
      buildMatch(panel, { repo: "acme/erp", kind: "repo", ref: null, head: null }, [main], project, detail)?.branch,
    ).toBe("main");
  });

  it("reads a pull request's head and recognizes forks", () => {
    const own = buildMatch(
      panel,
      { repo: "acme/erp", kind: "pull", ref: null, head: "acme:feature/x" },
      [main],
      project,
      detail,
    );
    expect(own).toMatchObject({ branch: "feature/x", canCreate: true, fork: false });
    const fork = buildMatch(
      panel,
      { repo: "acme/erp", kind: "pull", ref: null, head: "someone:feature/x" },
      [main],
      project,
      detail,
    );
    expect(fork).toMatchObject({ fork: true, canCreate: false, instances: [] });
  });

  it("works from instances alone when the token may not read projects", () => {
    const match = buildMatch(panel, { repo: "acme/erp", kind: "tree", ref: "main", head: null }, [main], null, null);
    expect(match).toMatchObject({ project: null, branch: "main" });
    expect(versionFor(null, [main])).toEqual({ version: "19.0", edition: "enterprise" });
  });

  it("stays away from repositories no panel knows", () => {
    expect(
      buildMatch(panel, { repo: "other/repo", kind: "repo", ref: null, head: null }, [main], null, null),
    ).toBeNull();
  });
});
