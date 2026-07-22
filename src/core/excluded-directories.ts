export function normalizeExcludedDirectories(values: Iterable<string>): string[] {
  const normalized = new Set<string>();
  for (const value of values) {
    const path = value
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/^\/+|\/+$/g, "");
    if (path && path !== ".") normalized.add(path);
  }
  return [...normalized];
}

export function isPathExcluded(path: string, directories: Iterable<string>): boolean {
  const cleanPath = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return normalizeExcludedDirectories(directories).some(
    directory => cleanPath === directory || cleanPath.startsWith(`${directory}/`),
  );
}
