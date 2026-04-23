/**
 * Union of valid context paths for `T` — both flat keys (`keyof T`) and
 * `.`/`:`-separated nested paths. Mirrors the runtime `resolve()` lookup:
 * first a flat literal key, then a segmented path.
 *
 * @example
 * type P = ContextPaths<{ editor: { lang: string }, debug: boolean }>
 * // 'editor' | 'debug' | 'editor.lang' | 'editor:lang'
 */
export type ContextPaths<T, P extends string = ''> = {
  [K in keyof T & string]:
    | `${P}${K}`
    | (T[K] extends readonly unknown[]
      ? never
      : T[K] extends (...args: never[]) => unknown
        ? never
        : T[K] extends object
          ? ContextPaths<T[K], `${P}${K}.`> | ContextPaths<T[K], `${P}${K}:`>
          : never)
}[keyof T & string]
