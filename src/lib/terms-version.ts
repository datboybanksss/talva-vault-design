/** Turns a stored version code (e.g. "v1.2") into the display label "Version 1.2". */
export function formatTermsVersion(version: string): string {
  return `Version ${version.trim().replace(/^v(?=\d)/i, "")}`;
}
