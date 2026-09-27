import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "@/lib/github/parser";

describe("parseGitHubUrl", () => {
  it("parses plain https URLs", () => {
    expect(parseGitHubUrl("https://github.com/vercel/next.js")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
  });

  it("parses URLs without protocol and trailing slash", () => {
    expect(parseGitHubUrl("github.com/user/repo/")).toEqual({
      owner: "user",
      repo: "repo",
    });
  });

  it("parses branch URLs", () => {
    expect(parseGitHubUrl("https://github.com/user/repo/tree/main")).toEqual({
      owner: "user",
      repo: "repo",
      branch: "main",
    });
  });

  it("parses branch + subpath URLs", () => {
    expect(parseGitHubUrl("https://github.com/user/repo/tree/master/packages/core/src")).toEqual({
      owner: "user",
      repo: "repo",
      branch: "master",
      path: "packages/core/src",
    });
  });

  it("parses .git suffix and owner/repo shorthand", () => {
    expect(parseGitHubUrl("https://github.com/user/repo.git")).toEqual({ owner: "user", repo: "repo" });
    expect(parseGitHubUrl("user/repo")).toEqual({ owner: "user", repo: "repo" });
  });

  it("rejects non-github hosts", () => {
    expect(parseGitHubUrl("https://gitlab.com/user/repo")).toBeNull();
    expect(parseGitHubUrl("https://evil.com/user/repo")).toBeNull();
  });

  it("rejects reserved github pages", () => {
    expect(parseGitHubUrl("https://github.com/user/repo/pulls")).toBeNull();
    expect(parseGitHubUrl("https://github.com/user/repo/issues/12")).toBeNull();
    expect(parseGitHubUrl("https://github.com/user/repo/pull/4")).toBeNull();
    expect(parseGitHubUrl("https://github.com/user/repo/wiki")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseGitHubUrl("")).toBeNull();
    expect(parseGitHubUrl("github.com/")).toBeNull();
    expect(parseGitHubUrl("github.com/user")).toBeNull();
    expect(parseGitHubUrl("just some text")).toBeNull();
    expect(parseGitHubUrl("https://github.com/user/")).toBeNull();
  });
});
