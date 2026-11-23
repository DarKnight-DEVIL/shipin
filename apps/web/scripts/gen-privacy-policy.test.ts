import { describe, expect, it } from "vitest";

import {
  isPrivacyPolicyCurrent,
  renderPrivacyPolicy,
} from "./gen-privacy-policy.mjs";

const pageSource = `
  <section id="data-retention" className="mb-12">
    <table>
      <tbody>
        <tr>
          <td>Profile</td>
          <td>Until deletion</td>
        </tr>
        <tr>
          <td>Orders</td>
          <td>8 years</td>
        </tr>
      </tbody>
    </table>
  </section>
`;

const table = [
  "| Record  | Kept for       |",
  "| ------- | -------------- |",
  "| Profile | Until deletion |",
  "| Orders  | 8 years        |",
].join("\n");

const lfMarkdown = `# Privacy Policy\n\n${table}\n\n## 2. Next section\n`;
const crlfMarkdown = lfMarkdown.replaceAll("\n", "\r\n");

describe("renderPrivacyPolicy", () => {
  it("preserves CRLF and treats the matching table as current", () => {
    expect(renderPrivacyPolicy(pageSource, crlfMarkdown)).toBe(crlfMarkdown);
    expect(isPrivacyPolicyCurrent(pageSource, crlfMarkdown)).toBe(true);
  });

  it("replaces a stale table without mixing line endings", () => {
    const stale = crlfMarkdown.replace(
      "| Orders  | 8 years        |",
      "| Orders  | 7 years        |"
    );

    expect(isPrivacyPolicyCurrent(pageSource, stale)).toBe(false);
    expect(renderPrivacyPolicy(pageSource, stale)).toBe(crlfMarkdown);
  });

  it("keeps LF when the policy uses LF", () => {
    expect(renderPrivacyPolicy(pageSource, lfMarkdown)).toBe(lfMarkdown);
  });

  it("fails when the policy has no retention table", () => {
    expect(() => renderPrivacyPolicy(pageSource, "# Privacy Policy\n")).toThrow(
      /no retention table/
    );
  });
});
