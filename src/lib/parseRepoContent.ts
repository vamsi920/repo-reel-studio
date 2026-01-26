/**
 * Parse gitingest output format to extract file path -> content.
 * Used by Processing and geminiDirector.
 */
export function parseRepoContent(content: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!content) return files;

  const patterns = [
    /={3,}\nFile:\s*(.+?)\n={3,}\n([\s\S]*?)(?=\n={3,}\nFile:|$)/g,
    /-+\nFile:\s*(.+?)\n-+\n([\s\S]*?)(?=\n-+\nFile:|$)/g,
    /-----\s*FILE:\s*(.+?)\s*-----\n([\s\S]*?)(?=\n-----\s*FILE:|$)/gi,
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
      buffer.push(line);
    }
  }
  flush();

  return files;
}
