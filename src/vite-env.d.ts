/// <reference types="vite/client" />

// `file.md?fm`: front matter parsed at build time (scripts/viteFrontmatter.ts).
declare module '*.md?fm' {
  const result: import('./frontmatter').FrontmatterResult
  export default result
}

// package.json "version", injected by vite.config.ts (src/release.ts).
declare const __APP_VERSION__: string
