# whenexpr

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

A tiny, zero-dependency evaluator for **when-clause expressions** — a mini expression language for conditionally enabling UI, commands, and features based on a context object.

Inspired by [VS Code's when clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts).

## Install

```sh
pnpm add whenexpr
```

## Usage

```ts
import { evaluateWhen } from 'whenexpr'

const ctx = {
  mode: 'development',
  debug: true,
  verbose: false,
}

evaluateWhen('debug && mode == development', ctx) // true
evaluateWhen('verbose || mode == production', ctx) // false
evaluateWhen('!verbose', ctx) // true
```

## Expression Syntax

whenexpr supports a JavaScript-expression subset: logical, equality, relational, and arithmetic operators, plus parentheses for grouping.

### Literals

| Kind    | Example                |
| ------- | ---------------------- |
| Boolean | `true`, `false`        |
| Number  | `42`, `1.5`            |
| String  | `"dev"`, `'dev'`       |

### Operators

| Category   | Operators                        | Example                       |
| ---------- | -------------------------------- | ----------------------------- |
| Unary      | `!`, `-`, `+`                    | `!verbose`, `-x`              |
| Logical    | `&&`, `\|\|`                     | `debug && !verbose`           |
| Equality   | `==`, `!=`, `===`, `!==`         | `mode == development`, `x === 1` |
| Relational | `<`, `<=`, `>`, `>=`             | `x >= 10`                     |
| Arithmetic | `+`, `-`, `*`, `/`, `%`          | `a + b * c`                   |
| Grouping   | `( … )`                          | `(a \|\| b) && c`             |

### Precedence (low to high)

`||` → `&&` → equality → relational → `+` `-` → `*` `/` `%` → unary → primary

### `==` vs `===` semantics

- **`==` / `!=`** follow the original VS Code when-clause idiom: the right-hand side is a single value token (bare identifier, quoted string, number, or boolean), compared as a string.
  ```ts
  evaluateWhen('mode == development', { mode: 'development' }) // true
  evaluateWhen('count == 5', { count: 5 }) // true — stringified
  ```

- **`===` / `!==`** follow JavaScript strict equality. Both sides are full expressions.
  ```ts
  evaluateWhen('x === 1', { x: 1 }) // true
  evaluateWhen('x === 1', { x: '1' }) // false — no coercion
  ```

### Examples

```ts
// Conditional UI visibility
evaluateWhen('debug && !verbose', ctx)

// Either/or
evaluateWhen('mode == development || mode == staging', ctx)

// Arithmetic + strict comparison
evaluateWhen('(((a || b) && c) + foo) === 1', {
  a: false,
  b: true,
  c: true,
  foo: 0,
}) // true

// Ranges
evaluateWhen('x >= 10 && x < 100', { x: 42 }) // true
```

## Namespaced Context Keys

Keys can be namespaced using `.` or `:` separators to avoid collisions between unrelated features or plugins:

```ts
// Flat keys (recommended)
const ctx = {
  'vite.mode': 'development',
  'vite:buildMode': 'lib',
}

// Nested objects (also supported)
const ctx = {
  vite: { mode: 'development', ssr: true },
}
```

Both styles work in expressions:

```ts
evaluateWhen('vite.mode == development', ctx)
evaluateWhen('vite:buildMode == lib', ctx)
evaluateWhen('vite.ssr', ctx)
```

### Lookup Order

When resolving a namespaced key like `vite.mode`:

1. **Exact match** — looks for `ctx['vite.mode']` first
2. **Nested path** — falls back to `ctx.vite?.mode`

Flat keys take priority over nested objects if both exist.

## API

### `evaluateWhen(expression, ctx, options?)`

Evaluate a when-clause expression against a context object. Returns `boolean`.

```ts
function evaluateWhen<T extends Record<string, unknown>>(
  expression: string,
  ctx: T,
  options?: { strict?: boolean },
): boolean
```

#### Strict mode

By default, unknown context keys evaluate to `undefined` (falsy). Pass `{ strict: true }` to throw an error instead — useful for catching typos or stale expressions during development:

```ts
evaluateWhen('unknownKey', {}, { strict: true })
// → Error: Unknown context key: "unknownKey"
```

Short-circuit evaluation still applies, so keys that aren't reached are not checked:

```ts
// `debug` is truthy, so `unknownKey` is never evaluated — no throw
evaluateWhen('debug || unknownKey', { debug: true }, { strict: true })
```

### `parse(expression)` and `evaluate(node, ctx, options?)`

Under the hood, `evaluateWhen` is `evaluate(parse(expression), ctx, options)`. You can split the two steps to avoid re-parsing when the same expression is evaluated against many contexts:

```ts
import { evaluate, parse } from 'whenexpr'

const node = parse('debug && mode == development')

evaluate(node, { debug: true, mode: 'development' }) // true
evaluate(node, { debug: true, mode: 'production' }) // false
```

`parse` returns a `WhenNode` — a discriminated union you can also inspect or transform:

```ts
type WhenNode
  = | { type: 'literal', value: boolean | number | string }
    | { type: 'key', key: string }
    | { type: 'unary', op: UnaryOp, operand: WhenNode }
    | { type: 'binary', op: BinaryOp, left: WhenNode, right: WhenNode }

type UnaryOp = '!' | '-' | '+'

type BinaryOp
  = | '||' | '&&'
    | '==' | '!=' | '===' | '!=='
    | '<' | '>' | '<=' | '>='
    | '+' | '-' | '*' | '/' | '%'
```

### `resolveContextValue(key, ctx)`

Resolve a single context key (including namespaced keys) from the context object. Returns `unknown`, or `undefined` if the key is not found.

```ts
function resolveContextValue<T extends Record<string, unknown>>(
  key: string,
  ctx: T,
): unknown
```

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg">
    <img src="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg" alt="Sponsors"/>
  </a>
</p>

## License

[MIT](./LICENSE) License © [Anthony Fu](https://github.com/antfu)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/whenexpr?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/whenexpr
[npm-downloads-src]: https://img.shields.io/npm/dm/whenexpr?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/whenexpr
[bundle-src]: https://img.shields.io/bundlephobia/minzip/whenexpr?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=whenexpr
[license-src]: https://img.shields.io/github/license/antfu/whenexpr.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/antfu/whenexpr/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/whenexpr
