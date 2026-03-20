/**
 * Parse gitingest output format to extract file path -> content.
 * Used by Processing and geminiDirector.
 */
export function parseRepoContent(content: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!content) return files;

  const patterns = [
    /={3,}\r?\nFile:\s*(.+?)\r?\n={3,}\r?\n([\s\S]*?)(?=\r?\n={3,}\r?\nFile:|$)/ig,
    /-+\r?\nFile:\s*(.+?)\r?\n-+\r?\n([\s\S]*?)(?=\r?\n-+\r?\nFile:|$)/ig,
    /-+\s*FILE:\s*(.+?)\s*-+\r?\n([\s\S]*?)(?=\r?\n-+\s*FILE:|$)/ig,
  ];

  const tryPattern = (pattern: RegExp) => {
    pattern.lastIndex = 0;
    let match;
    let matches = 0;
    while ((match = pattern.exec(content)) !== null) {
      const filePath = match[1].trim();
      const fileContent = match[2].trim();
      if (filePath) {
        files[filePath] = fileContent;
        matches += 1;
      }
    }
    return matches;
  };

  for (const pattern of patterns) {
    if (tryPattern(pattern) > 0) {
      return files;
    }
  }

  const lines = content.split(/\r?\n/);
  let currentPath = "";
  let buffer: string[] = [];
  const flush = () => {
    if (!currentPath) return;
    files[currentPath] = buffer.join("\n").trim();
    buffer = [];
  };

  const headerRegex = /^(?:[=-]+\s*)?file:\s*(.+?)(?:\s*[=-]+)?$/i;
  for (const line of lines) {
    const headerMatch = line.match(headerRegex);
    if (headerMatch) {
      flush();
      currentPath = headerMatch[1].trim();
      continue;
    }
    if (currentPath) {
      if (/^[=\-]{3,}$/.test(line.trim())) continue; // Strip raw visual demarcations
      buffer.push(line);
    }
  }
  flush();

  return files;
}
