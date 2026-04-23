import { describe, expect, it } from 'vitest'
import { evaluateWhen } from '../src/index'

describe('evaluateWhen', () => {
  // Broad type so runtime tests that reference unknown keys still typecheck;
  // narrower types are covered by test/types.test-d.ts.
  const ctx: Record<string, unknown> = {
    mode: 'development',
    debug: true,
    verbose: false,
    label: 'primary',
  }

  describe('literal booleans', () => {
    it('evaluates "true" literal', () => {
      expect(evaluateWhen('true', ctx)).toBe(true)
    })

    it('evaluates "false" literal', () => {
      expect(evaluateWhen('false', ctx)).toBe(false)
    })

    it('evaluates "!true" to false', () => {
      expect(evaluateWhen('!true', ctx)).toBe(false)
    })

    it('evaluates "!false" to true', () => {
      expect(evaluateWhen('!false', ctx)).toBe(true)
    })

    it('supports "true" in AND expressions', () => {
      expect(evaluateWhen('true && debug', ctx)).toBe(true)
      expect(evaluateWhen('true && verbose', ctx)).toBe(false)
    })

    it('supports "false" in OR expressions', () => {
      expect(evaluateWhen('false || debug', ctx)).toBe(true)
      expect(evaluateWhen('false || verbose', ctx)).toBe(false)
    })
  })

  describe('bare truthy', () => {
    it('evaluates true for truthy values', () => {
      expect(evaluateWhen('debug', ctx)).toBe(true)
    })

    it('evaluates false for falsy values', () => {
      expect(evaluateWhen('verbose', ctx)).toBe(false)
    })

    it('evaluates true for non-empty string', () => {
      expect(evaluateWhen('label', ctx)).toBe(true)
    })

    it('evaluates false for undefined keys', () => {
      expect(evaluateWhen('unknownKey', ctx)).toBe(false)
    })
  })

  describe('negation (!)', () => {
    it('negates truthy to false', () => {
      expect(evaluateWhen('!debug', ctx)).toBe(false)
    })

    it('negates falsy to true', () => {
      expect(evaluateWhen('!verbose', ctx)).toBe(true)
    })

    it('negates undefined to true', () => {
      expect(evaluateWhen('!unknownKey', ctx)).toBe(true)
    })
  })

  describe('equality (==)', () => {
    it('matches string values', () => {
      expect(evaluateWhen('mode == development', ctx)).toBe(true)
    })

    it('rejects non-matching string values', () => {
      expect(evaluateWhen('mode == production', ctx)).toBe(false)
    })

    it('compares boolean as string', () => {
      expect(evaluateWhen('debug == true', ctx)).toBe(true)
      expect(evaluateWhen('debug == false', ctx)).toBe(false)
    })

    it('matches string label', () => {
      expect(evaluateWhen('label == primary', ctx)).toBe(true)
      expect(evaluateWhen('label == secondary', ctx)).toBe(false)
    })
  })

  describe('inequality (!=)', () => {
    it('true when values differ', () => {
      expect(evaluateWhen('mode != production', ctx)).toBe(true)
    })

    it('false when values match', () => {
      expect(evaluateWhen('mode != development', ctx)).toBe(false)
    })
  })

  describe('and (&&)', () => {
    it('true when all parts are true', () => {
      expect(evaluateWhen('debug && !verbose', ctx)).toBe(true)
    })

    it('false when any part is false', () => {
      expect(evaluateWhen('debug && verbose', ctx)).toBe(false)
    })

    it('supports three-part AND', () => {
      expect(evaluateWhen('debug && !verbose && mode == development', ctx)).toBe(true)
      expect(evaluateWhen('debug && !verbose && mode == production', ctx)).toBe(false)
    })
  })

  describe('or (||)', () => {
    it('true when any part is true', () => {
      expect(evaluateWhen('verbose || debug', ctx)).toBe(true)
    })

    it('false when all parts are false', () => {
      expect(evaluateWhen('verbose || !debug', ctx)).toBe(false)
    })

    it('supports mixed AND and OR (OR of ANDs)', () => {
      expect(evaluateWhen('verbose && mode == production || debug', ctx)).toBe(true)
    })
  })

  describe('with empty string values', () => {
    const emptyCtx = {
      mode: 'production',
      debug: false,
      verbose: true,
      label: '',
    }

    it('empty string is falsy', () => {
      expect(evaluateWhen('label', emptyCtx)).toBe(false)
    })

    it('negation of empty string is true', () => {
      expect(evaluateWhen('!label', emptyCtx)).toBe(true)
    })
  })

  describe('namespaced keys (dot separator)', () => {
    const nsCtx: Record<string, unknown> = {
      'debug': true,
      'vite.mode': 'development',
    }

    it('resolves flat namespaced key via exact match', () => {
      expect(evaluateWhen('vite.mode == development', nsCtx)).toBe(true)
      expect(evaluateWhen('vite.mode == production', nsCtx)).toBe(false)
    })

    it('bare truthy on flat namespaced key', () => {
      expect(evaluateWhen('vite.mode', nsCtx)).toBe(true)
      expect(evaluateWhen('vite.unknown', nsCtx)).toBe(false)
    })

    it('negation on flat namespaced key', () => {
      expect(evaluateWhen('!vite.mode', nsCtx)).toBe(false)
      expect(evaluateWhen('!vite.unknown', nsCtx)).toBe(true)
    })
  })

  describe('namespaced keys (colon separator)', () => {
    const nsCtx = {
      'debug': true,
      'vite:buildMode': 'lib',
    }

    it('resolves colon-namespaced key via exact match', () => {
      expect(evaluateWhen('vite:buildMode == lib', nsCtx)).toBe(true)
      expect(evaluateWhen('vite:buildMode == app', nsCtx)).toBe(false)
    })

    it('bare truthy on colon-namespaced key', () => {
      expect(evaluateWhen('vite:buildMode', nsCtx)).toBe(true)
    })
  })

  describe('namespaced keys (nested objects)', () => {
    const nestedCtx: Record<string, unknown> = {
      debug: true,
      vite: { mode: 'development', ssr: true },
    }

    it('resolves nested object via dot path', () => {
      expect(evaluateWhen('vite.mode == development', nestedCtx)).toBe(true)
      expect(evaluateWhen('vite.ssr', nestedCtx)).toBe(true)
      expect(evaluateWhen('!vite.ssr', nestedCtx)).toBe(false)
    })

    it('returns undefined for missing nested path', () => {
      expect(evaluateWhen('vite.missing', nestedCtx)).toBe(false)
      expect(evaluateWhen('!vite.missing', nestedCtx)).toBe(true)
    })
  })

  describe('namespaced keys in compound expressions', () => {
    const nsCtx = {
      'debug': true,
      'verbose': false,
      'vite.mode': 'development',
    }

    it('and with namespaced key', () => {
      expect(evaluateWhen('debug && vite.mode == development', nsCtx)).toBe(true)
      expect(evaluateWhen('verbose && vite.mode == development', nsCtx)).toBe(false)
    })

    it('or with namespaced key', () => {
      expect(evaluateWhen('verbose || vite.mode == development', nsCtx)).toBe(true)
    })
  })

  describe('strict mode', () => {
    const strictCtx: Record<string, unknown> = {
      debug: true,
      verbose: false,
      mode: 'development',
      vite: { mode: 'development' },
    }

    it('throws on unknown bare key', () => {
      expect(() => evaluateWhen('unknownKey', strictCtx, { strict: true }))
        .toThrow('Unknown context key: "unknownKey"')
    })

    it('throws on unknown negated key', () => {
      expect(() => evaluateWhen('!unknownKey', strictCtx, { strict: true }))
        .toThrow('Unknown context key: "unknownKey"')
    })

    it('throws on unknown key in equality', () => {
      expect(() => evaluateWhen('unknownKey == foo', strictCtx, { strict: true }))
        .toThrow('Unknown context key: "unknownKey"')
    })

    it('throws on unknown key in inequality', () => {
      expect(() => evaluateWhen('unknownKey != foo', strictCtx, { strict: true }))
        .toThrow('Unknown context key: "unknownKey"')
    })

    it('throws on unknown nested path', () => {
      expect(() => evaluateWhen('vite.missing', strictCtx, { strict: true }))
        .toThrow('Unknown context key: "vite.missing"')
    })

    it('does not throw for known keys', () => {
      expect(evaluateWhen('debug', strictCtx, { strict: true })).toBe(true)
      expect(evaluateWhen('verbose', strictCtx, { strict: true })).toBe(false)
      expect(evaluateWhen('mode == development', strictCtx, { strict: true })).toBe(true)
      expect(evaluateWhen('vite.mode == development', strictCtx, { strict: true })).toBe(true)
    })

    it('does not throw for literal booleans', () => {
      expect(evaluateWhen('true', strictCtx, { strict: true })).toBe(true)
      expect(evaluateWhen('false', strictCtx, { strict: true })).toBe(false)
      expect(evaluateWhen('!true', strictCtx, { strict: true })).toBe(false)
    })

    it('short-circuits on OR — unknown key after truthy part is not evaluated', () => {
      expect(evaluateWhen('debug || unknownKey', strictCtx, { strict: true })).toBe(true)
    })

    it('short-circuits on AND — unknown key after falsy part is not evaluated', () => {
      expect(evaluateWhen('verbose && unknownKey', strictCtx, { strict: true })).toBe(false)
    })

    it('defaults to non-strict when option omitted', () => {
      expect(evaluateWhen('unknownKey', strictCtx)).toBe(false)
      expect(evaluateWhen('!unknownKey', strictCtx)).toBe(true)
    })

    it('is non-strict when option is explicitly false', () => {
      expect(evaluateWhen('unknownKey', strictCtx, { strict: false })).toBe(false)
    })
  })
})
