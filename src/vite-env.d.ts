/// <reference types="vite/client" />

// `file.md?fm`: front matter parsed at build time (scripts/viteFrontmatter.ts).
declare module '*.md?fm' {
  const result: import('./frontmatter').FrontmatterResult
  export default result
}
