export interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

export interface GrepResult {
  matches: GrepMatch[];
  totalMatches: number;
  filesSearched: number;
  truncated: boolean;
  error?: string;
}

export interface CountResult {
  file: string;
  count: number;
}

export interface GrepOptions {
  pattern: string;
  paths?: string[];
  globs?: string[];
  excludeGlobs?: string[];
  context?: number;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  fixedStrings?: boolean;
  multiline?: boolean;
  hidden?: boolean;
  noIgnore?: boolean;
  fileType?: string[];
  maxDepth?: number;
  maxFilesize?: string;
  maxCount?: number;
  maxColumns?: number;
  timeout?: number;
}
