/**
 * Format a working directory path for sidebar display.
 * Shows the last two path segments prefixed with /.
 */
export function formatCwd(cwd?: string): string {
  if (!cwd) return "Working dir unavailable";
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const tail = parts.slice(-2).join("/");
  return `/${tail || cwd}`;
}
