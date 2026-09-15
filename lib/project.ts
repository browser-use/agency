export const DEFAULT_PROJECT_ID = "default";
export const MAX_PROJECT_LABEL_LENGTH = 40;

export type Project = { id: string; label: string; open: number; cards: number };

const PROJECT_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const ACTIVE_PROJECT_KEY = "agency-project";

/** A project id is a short lowercase slug such as `acme` or `docs-site`. Anything else is null. */
export function parseProjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return PROJECT_ID.test(id) ? id : null;
}

export function projectSlug(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "");
}

/** Reads a body `projectId`, else `?project=`. Missing means the default project; malformed is null. */
export function requestProjectId(request: Request, bodyValue?: unknown) {
  const raw = bodyValue ?? new URL(request.url).searchParams.get("project");
  if (raw === undefined || raw === null || raw === "") return DEFAULT_PROJECT_ID;
  return parseProjectId(raw);
}

/** The project the browser last used: `?project=` wins, then the remembered choice. */
export function readActiveProject() {
  if (typeof window === "undefined") return DEFAULT_PROJECT_ID;
  const fromUrl = parseProjectId(new URLSearchParams(window.location.search).get("project"));
  if (fromUrl) return fromUrl;
  try {
    return parseProjectId(window.localStorage.getItem(ACTIVE_PROJECT_KEY)) ?? DEFAULT_PROJECT_ID;
  } catch {
    return DEFAULT_PROJECT_ID;
  }
}

export function rememberActiveProject(projectId: string) {
  try { window.localStorage.setItem(ACTIVE_PROJECT_KEY, projectId); } catch { /* private mode */ }
}

/** Keeps the project in links so another tab's choice cannot redirect this one. */
export function projectHref(path: string, projectId: string) {
  if (projectId === DEFAULT_PROJECT_ID) return path;
  return `${path}${path.includes("?") ? "&" : "?"}project=${encodeURIComponent(projectId)}`;
}
