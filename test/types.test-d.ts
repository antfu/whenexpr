import type { ContextPaths, ValidateExpression, WhenExpression, WhenExpressionError } from '../src/index'
import { assertType, describe, expectTypeOf, it } from 'vitest'
import { evaluateWhen } from '../src/index'

interface Ctx {
  mode: 'development' | 'production'
  debug: boolean
  verbose: boolean
  label: string
}

interface Nested {
  editor: { lang: string, tabSize: number }
  debug: boolean
}

interface Flat {
  'view:explorer': boolean
  'debug': boolean
}

declare const ctx: Ctx
declare const nested: Nested
declare const flat: Flat

describe('evaluateWhen — typed ctx triggers static validation', () => {
  it('accepts a bare context key', () => {
    expectTypeOf(evaluateWhen('debug', ctx)).toEqualTypeOf<boolean>()
  })

  it('accepts `&&` between two keys', () => {
    evaluateWhen('debug && verbose', ctx)
  })

  it('VS Code-style `==` with bare identifier RHS (literal, not a key)', () => {
    // `development` must NOT be validated as a context key
    evaluateWhen('mode == development', ctx)
    evaluateWhen('debug && mode == development', ctx)
  })

  it('`===` with quoted string RHS', () => {
    evaluateWhen('mode === "production"', ctx)
  })

  it('unary not + parens', () => {
    evaluateWhen('!(debug || verbose)', ctx)
  })

  it('all-literal expressions (no keys) are accepted', () => {
    evaluateWhen('true', ctx)
    evaluateWhen('!false', ctx)
  })
})

describe('evaluateWhen — rejects unknown keys and syntax errors', () => {
  it('rejects a bare unknown key', () => {
    // @ts-expect-error: 'xxx' is not a key of Ctx
    evaluateWhen('xxx', ctx)
  })

  it('rejects unknown key in && RHS', () => {
    // @ts-expect-error: 'zzz' is not a key of Ctx
    evaluateWhen('debug && zzz', ctx)
  })

  it('rejects unknown key on LHS of `===`', () => {
    // @ts-expect-error: 'nope' is not a key of Ctx
    evaluateWhen('nope === "x"', ctx)
  })

  it('rejects syntax errors', () => {
    // @ts-expect-error: invalid operator sequence
    evaluateWhen('debug &&& verbose', ctx)
  })

  it('rejects unbalanced parens', () => {
    // @ts-expect-error: missing closing paren
    evaluateWhen('(debug', ctx)
  })

  it('rejects an empty expression', () => {
    // @ts-expect-error: empty expression has no primary
    evaluateWhen('', ctx)
  })
})

describe('evaluateWhen — nested paths (dot and colon separators)', () => {
  it('accepts dot-path', () => {
    evaluateWhen('editor.lang == ts', nested)
  })

  it('accepts colon-path', () => {
    evaluateWhen('editor:lang == ts', nested)
  })

  it('accepts the intermediate object key', () => {
    evaluateWhen('debug && editor.tabSize === 2', nested)
  })

  it('rejects an unknown nested path', () => {
    // @ts-expect-error: 'editor.unknown' is not a path of Nested
    evaluateWhen('editor.unknown === 1', nested)
  })
})

describe('evaluateWhen — flat colon keys', () => {
  it('accepts a literal key containing a colon', () => {
    evaluateWhen('view:explorer', flat)
    evaluateWhen('view:explorer && debug', flat)
  })
})

describe('evaluateWhen — dynamic strings skip validation', () => {
  it('accepts a dynamic string variable (typed as `string`)', () => {
    const dyn: string = 'debug'
    evaluateWhen(dyn, ctx)
  })

  it('accepts any cast string', () => {
    evaluateWhen('xxx && yyy' as string, ctx)
  })
})

describe('evaluateWhen — wide ctx: syntax checked, keys not', () => {
  it('Record<string, unknown> — unknown keys allowed, syntax still validated', () => {
    const broad: Record<string, unknown> = { foo: 1 }
    evaluateWhen('xxx && yyy', broad) // unknown keys ok
    // @ts-expect-error — syntax error still caught
    evaluateWhen('(unbalanced', broad)
  })

  it('`object` ctx (no keys) — same behaviour', () => {
    const anyObj: object = {}
    evaluateWhen('anything == here', anyObj)
    // @ts-expect-error — invalid operator sequence
    evaluateWhen('debug &&& verbose', anyObj)
  })

  it('`{}` ctx — same behaviour', () => {
    // eslint-disable-next-line ts/no-empty-object-type
    const empty: {} = {}
    evaluateWhen('free && form', empty)
    // @ts-expect-error — syntax error
    evaluateWhen('!!', empty)
  })
})

describe('ContextPaths', () => {
  it('enumerates flat keys', () => {
    type P = ContextPaths<{ a: string, b: number }>
    expectTypeOf<P>().toEqualTypeOf<'a' | 'b'>()
  })

  it('enumerates nested dotted and colon-separated paths', () => {
    type P = ContextPaths<{ x: { y: string } }>
    expectTypeOf<P>().toEqualTypeOf<'x' | 'x.y' | 'x:y'>()
  })
})

describe('ValidateExpression', () => {
  it('returns the original string on success', () => {
    type R = ValidateExpression<'debug && verbose', Ctx>
    expectTypeOf<R>().toEqualTypeOf<'debug && verbose'>()
  })

  it('returns a branded error type on unknown key', () => {
    type R = ValidateExpression<'xxx', Ctx>
    assertType<WhenExpressionError<'Unknown context key: "xxx"'>>(null as unknown as R)
  })
})

describe('WhenExpression — building typed define helpers', () => {
  // The library consumer's own define function:
  function defineCommand<const W extends string>(cmd: {
    name: string
    title: string
    when?: WhenExpression<Ctx, W>
  }): typeof cmd {
    return cmd
  }

  it('accepts valid when expressions', () => {
    defineCommand({ name: 'toggle', title: 'Toggle', when: 'debug' })
    defineCommand({ name: 'go', title: 'Go', when: 'debug && mode == development' })
    defineCommand({ name: 'hide', title: 'Hide' }) // `when` omitted
  })

  it('rejects unknown keys in `when`', () => {
    defineCommand({
      name: 'x',
      title: 'X',
      // @ts-expect-error 'typo' is not a key of Ctx
      when: 'typo && debug',
    })
  })

  it('rejects syntax errors in `when`', () => {
    defineCommand({
      name: 'x',
      title: 'X',
      // @ts-expect-error invalid operator
      when: 'debug &&& verbose',
    })
  })

  it('allows dynamic strings (opt-out)', () => {
    const dyn: string = 'debug'
    defineCommand({ name: 'x', title: 'X', when: dyn })
  })
})
