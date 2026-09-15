// The suites run in node but typecheck under the app's browser tsconfig, which
// deliberately has no @types/node — adding it would retype setTimeout and
// friends across all of src. This declares only the node surface the palette
// suite touches.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function readdirSync(path: string): string[]
  export function statSync(path: string): { isDirectory(): boolean }
}
declare module 'node:path' {
  export function join(...parts: string[]): string
  export function relative(from: string, to: string): string
}
