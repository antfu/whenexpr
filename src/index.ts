import type { ValidateExpression } from './types'

export type { ContextPaths } from './paths'
export type { ValidateExpression, WhenExpression, WhenExpressionError } from './types'

export interface EvaluateOptions {
  /**
   * If `true`, throw when the expression references a context key that does
   * not exist. Defaults to `false`, where unknown keys evaluate to `undefined`.
   */
  strict?: boolean
}

export type UnaryOp = '!' | '-' | '+'

export type BinaryOp
  = | '||' | '&&'
    | '==' | '!=' | '===' | '!=='
    | '<' | '>' | '<=' | '>='
    | '+' | '-' | '*' | '/' | '%'

/**
 * AST node for a parsed when-clause expression.
 */
export type WhenNode
  = | { type: 'literal', value: boolean | number | string }
    | { type: 'key', key: string }
    | { type: 'unary', op: UnaryOp, operand: WhenNode }
    | { type: 'binary', op: BinaryOp, left: WhenNode, right: WhenNode }

// ---------- Tokenizer ----------

type Token
  = | { type: 'number', value: number }
    | { type: 'string', value: string }
    | { type: 'ident', value: string }
    | { type: 'bool', value: boolean }
    | { type: 'op', value: string }
    | { type: 'lparen' }
    | { type: 'rparen' }
    | { type: 'eof' }

// Multi-character operators must come before their single-character prefixes.
const OPS = [
  '===',
  '!==',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
]

const IDENT_START = /[a-z_$]/i
const IDENT_CONT = /[\w$.:]/
const DIGIT = /\d/
const WHITESPACE = /\s/

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const c = input[i]

    if (WHITESPACE.test(c)) {
      i++
      continue
    }
    if (c === '(') {
      tokens.push({ type: 'lparen' })
      i++
      continue
    }
    if (c === ')') {
      tokens.push({ type: 'rparen' })
      i++
      continue
    }

    let matched = false
    for (const op of OPS) {
      if (input.startsWith(op, i)) {
        tokens.push({ type: 'op', value: op })
        i += op.length
        matched = true
        break
      }
    }
    if (matched)
      continue

    // Number: integer or decimal
    if (DIGIT.test(c)) {
      let j = i
      while (j < input.length && DIGIT.test(input[j]))
        j++
      if (input[j] === '.' && j + 1 < input.length && DIGIT.test(input[j + 1])) {
        j++
        while (j < input.length && DIGIT.test(input[j]))
          j++
      }
      tokens.push({ type: 'number', value: Number(input.slice(i, j)) })
      i = j
      continue
    }

    // Quoted string
    if (c === '"' || c === '\'') {
      const quote = c
      let j = i + 1
      let value = ''
      while (j < input.length && input[j] !== quote) {
        if (input[j] === '\\' && j + 1 < input.length) {
          const nx = input[j + 1]
          value += nx === 'n' ? '\n' : nx === 't' ? '\t' : nx
          j += 2
        }
        else {
          value += input[j]
          j++
        }
      }
      if (j >= input.length)
        throw new Error(`Unterminated string literal at position ${i}`)
      j++
      tokens.push({ type: 'string', value })
      i = j
      continue
    }

    // Identifier (may contain `.` or `:` for namespaced keys)
    if (IDENT_START.test(c)) {
      let j = i
      while (j < input.length && IDENT_CONT.test(input[j]))
        j++
      const name = input.slice(i, j)
      if (name === 'true')
        tokens.push({ type: 'bool', value: true })
      else if (name === 'false')
        tokens.push({ type: 'bool', value: false })
      else
        tokens.push({ type: 'ident', value: name })
      i = j
      continue
    }

    throw new Error(`Unexpected character "${c}" at position ${i}`)
  }
  tokens.push({ type: 'eof' })
  return tokens
}

// ---------- Parser ----------

/**
 * Parse a when-clause expression string into an AST.
 *
 * Grammar (lowest to highest precedence):
 * - `||` — logical OR
 * - `&&` — logical AND
 * - `==`, `!=`, `===`, `!==` — equality
 * - `<`, `>`, `<=`, `>=` — relational
 * - `+`, `-` — additive
 * - `*`, `/`, `%` — multiplicative
 * - `!`, `-`, `+` — unary
 * - primary: literals (number, string, boolean), identifiers, `( … )`
 *
 * `==` and `!=` follow VS Code-style semantics: the right-hand side is a
 * simple value literal or bare identifier (treated as an implicit string),
 * not a full expression. Use `===` / `!==` for JS-style strict equality with
 * full expressions on both sides.
 */
export function parse(expression: string): WhenNode {
  const tokens = tokenize(expression)
  let pos = 0

  const peek = (): Token => tokens[pos]
  const consume = (): Token => tokens[pos++]
  const isOp = (op: string): boolean => {
    const t = peek()
    return t.type === 'op' && t.value === op
  }
  const consumeOp = (): string => {
    const t = consume()
    if (t.type !== 'op')
      throw new Error(`internal: expected operator token, got ${tokenLabel(t)}`)
    return t.value
  }

  function parseOr(): WhenNode {
    let left = parseAnd()
    while (isOp('||')) {
      consume()
      left = { type: 'binary', op: '||', left, right: parseAnd() }
    }
    return left
  }

  function parseAnd(): WhenNode {
    let left = parseEquality()
    while (isOp('&&')) {
      consume()
      left = { type: 'binary', op: '&&', left, right: parseEquality() }
    }
    return left
  }

  function parseEquality(): WhenNode {
    let left = parseRelational()
    while (isOp('===') || isOp('!==') || isOp('==') || isOp('!=')) {
      const op = consumeOp() as BinaryOp
      const right = (op === '==' || op === '!=')
        ? parseValueRhs()
        : parseRelational()
      left = { type: 'binary', op, left, right }
    }
    return left
  }

  function parseRelational(): WhenNode {
    let left = parseAdditive()
    while (isOp('<=') || isOp('>=') || isOp('<') || isOp('>')) {
      const op = consumeOp() as BinaryOp
      left = { type: 'binary', op, left, right: parseAdditive() }
    }
    return left
  }

  function parseAdditive(): WhenNode {
    let left = parseMultiplicative()
    while (isOp('+') || isOp('-')) {
      const op = consumeOp() as BinaryOp
      left = { type: 'binary', op, left, right: parseMultiplicative() }
    }
    return left
  }

  function parseMultiplicative(): WhenNode {
    let left = parseUnary()
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = consumeOp() as BinaryOp
      left = { type: 'binary', op, left, right: parseUnary() }
    }
    return left
  }

  function parseUnary(): WhenNode {
    if (isOp('!') || isOp('-') || isOp('+')) {
      const op = consumeOp() as UnaryOp
      return { type: 'unary', op, operand: parseUnary() }
    }
    return parsePrimary()
  }

  function parsePrimary(): WhenNode {
    const t = peek()
    if (t.type === 'number' || t.type === 'string' || t.type === 'bool') {
      consume()
      return { type: 'literal', value: t.value }
    }
    if (t.type === 'ident') {
      consume()
      return { type: 'key', key: t.value }
    }
    if (t.type === 'lparen') {
      consume()
      const node = parseOr()
      const close = peek()
      if (close.type !== 'rparen')
        throw new Error(`Expected ")" but got ${tokenLabel(close)}`)
      consume()
      return node
    }
    throw new Error(`Unexpected token: ${tokenLabel(t)}`)
  }

  // RHS of `==` / `!=`: single value token treated as a string literal.
  function parseValueRhs(): WhenNode {
    const t = peek()
    if (t.type === 'string') {
      consume()
      return { type: 'literal', value: t.value }
    }
    if (t.type === 'number') {
      consume()
      return { type: 'literal', value: String(t.value) }
    }
    if (t.type === 'bool') {
      consume()
      return { type: 'literal', value: String(t.value) }
    }
    if (t.type === 'ident') {
      consume()
      return { type: 'literal', value: t.value }
    }
    throw new Error(`Expected value literal or identifier on right side of equality, got ${tokenLabel(t)}`)
  }

  const node = parseOr()
  const end = peek()
  if (end.type !== 'eof')
    throw new Error(`Unexpected token: ${tokenLabel(end)}`)
  return node
}

function tokenLabel(t: Token): string {
  switch (t.type) {
    case 'eof': return 'end of expression'
    case 'lparen': return '"("'
    case 'rparen': return '")"'
    case 'op':
    case 'ident':
    case 'string':
      return `"${t.value}"`
    case 'number':
    case 'bool':
      return `"${String(t.value)}"`
  }
}

// ---------- Evaluator ----------

/**
 * Evaluate a parsed when-clause AST against a context object.
 *
 * With `{ strict: true }`, referencing an unknown context key throws.
 * Short-circuit evaluation still applies — keys not reached are not checked.
 */
export function evaluate<T extends Record<string, unknown>>(
  node: WhenNode,
  ctx: T,
  options: EvaluateOptions = {},
): boolean {
  const { strict = false } = options
  return !!run(node, ctx, strict)
}

function run(node: WhenNode, ctx: Record<string, unknown>, strict: boolean): unknown {
  switch (node.type) {
    case 'literal':
      return node.value
    case 'key':
      return lookup(node.key, ctx, strict)
    case 'unary':
      return runUnary(node.op, run(node.operand, ctx, strict))
    case 'binary':
      return runBinary(node, ctx, strict)
  }
}

function runUnary(op: UnaryOp, v: unknown): unknown {
  switch (op) {
    case '!': return !v
    case '-': return -(v as number)
    case '+': return +(v as number)
  }
}

function runBinary(
  node: Extract<WhenNode, { type: 'binary' }>,
  ctx: Record<string, unknown>,
  strict: boolean,
): unknown {
  const { op } = node
  // Short-circuit logical ops
  if (op === '&&') {
    const l = run(node.left, ctx, strict)
    return l ? run(node.right, ctx, strict) : l
  }
  if (op === '||') {
    const l = run(node.left, ctx, strict)
    return l || run(node.right, ctx, strict)
  }
  const l = run(node.left, ctx, strict) as never
  const r = run(node.right, ctx, strict) as never
  switch (op) {
    case '==': return String(l) === String(r)
    case '!=': return String(l) !== String(r)
    case '===': return l === r
    case '!==': return l !== r
    case '<': return l < r
    case '>': return l > r
    case '<=': return l <= r
    case '>=': return l >= r
    case '+': return (l as number) + (r as number)
    case '-': return (l as number) - (r as number)
    case '*': return (l as number) * (r as number)
    case '/': return (l as number) / (r as number)
    case '%': return (l as number) % (r as number)
  }
}

// ---------- Public API ----------

/**
 * Evaluate a when-clause expression string against a context object.
 * Equivalent to `evaluate(parse(expression), ctx, options)`.
 *
 * Supports a JS-expression subset:
 * - Literals: booleans, numbers, strings (quoted with `"` or `'`)
 * - Identifiers: bare keys, including namespaced (`vite.mode`, `vite:buildMode`)
 * - Logical: `&&`, `||`, `!`
 * - Equality: `==`, `!=` (string comparison, bare identifier RHS treated as string),
 *             `===`, `!==` (JS strict equality with full expression RHS)
 * - Relational: `<`, `<=`, `>`, `>=`
 * - Arithmetic: `+`, `-`, `*`, `/`, `%`, unary `-` / `+`
 * - Grouping: `(` … `)`
 *
 * When `ctx` has a specific type with known keys, the expression string is
 * **statically validated** — unknown context keys and syntax errors surface
 * as TypeScript errors at the call site. Pass `ctx` typed as
 * `Record<string, unknown>`, or the expression as `string`, to opt out of
 * static checking (e.g. for dynamic expressions).
 *
 * With `{ strict: true }`, referencing an unknown context key at runtime
 * throws. Short-circuit evaluation still applies — keys not reached are not
 * checked.
 */
export function evaluateWhen<
  T extends object,
  const E extends string,
>(
  expression: E & ValidateExpression<E, T>,
  ctx: T,
  options?: EvaluateOptions,
): boolean {
  return evaluate(parse(expression as string), ctx as Record<string, unknown>, options)
}

/**
 * Resolve a context value by key. Supports namespaced keys with `.` or `:` separators.
 *
 * Lookup order:
 * 1. Exact match — `ctx['plugin.mode']` or `ctx['plugin:mode']`
 * 2. Nested path — e.g. `plugin.mode` falls back to `ctx.plugin?.mode`
 *
 * Returns `undefined` for unknown keys.
 */
export function resolveContextValue<T extends Record<string, unknown>>(key: string, ctx: T): unknown {
  return resolve(key, ctx).value
}

function lookup(key: string, ctx: Record<string, unknown>, strict: boolean): unknown {
  const { found, value } = resolve(key, ctx)
  if (!found && strict)
    throw new Error(`Unknown context key: "${key}"`)
  return value
}

function resolve(key: string, ctx: Record<string, unknown>): { found: boolean, value: unknown } {
  if (key in ctx)
    return { found: true, value: ctx[key] }

  const separator = key.includes('.') ? '.' : key.includes(':') ? ':' : null
  if (separator) {
    const segments = key.split(separator)
    let current: unknown = ctx
    for (const segment of segments) {
      if (current == null || typeof current !== 'object')
        return { found: false, value: undefined }
      const obj = current as Record<string, unknown>
      if (!(segment in obj))
        return { found: false, value: undefined }
      current = obj[segment]
    }
    return { found: true, value: current }
  }

  return { found: false, value: undefined }
}
