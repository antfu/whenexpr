import { describe, expect, it } from 'vitest'
import { evaluate, evaluateWhen, parse } from '../src/index'

describe('evaluate', () => {
  const ctx = {
    debug: true,
    verbose: false,
    mode: 'development',
  }

  describe('ast input', () => {
    it('evaluates a literal node', () => {
      expect(evaluate({ type: 'literal', value: true }, ctx)).toBe(true)
      expect(evaluate({ type: 'literal', value: false }, ctx)).toBe(false)
      expect(evaluate({ type: 'literal', value: 1 }, ctx)).toBe(true)
      expect(evaluate({ type: 'literal', value: 0 }, ctx)).toBe(false)
      expect(evaluate({ type: 'literal', value: 'hi' }, ctx)).toBe(true)
      expect(evaluate({ type: 'literal', value: '' }, ctx)).toBe(false)
    })

    it('evaluates a key node', () => {
      expect(evaluate({ type: 'key', key: 'debug' }, ctx)).toBe(true)
      expect(evaluate({ type: 'key', key: 'verbose' }, ctx)).toBe(false)
    })

    it('evaluates a unary node', () => {
      expect(evaluate({
        type: 'unary',
        op: '!',
        operand: { type: 'key', key: 'verbose' },
      }, ctx)).toBe(true)
    })

    it('evaluates a binary && node', () => {
      expect(evaluate({
        type: 'binary',
        op: '&&',
        left: { type: 'key', key: 'debug' },
        right: { type: 'key', key: 'verbose' },
      }, ctx)).toBe(false)
    })

    it('evaluates a binary || node', () => {
      expect(evaluate({
        type: 'binary',
        op: '||',
        left: { type: 'key', key: 'verbose' },
        right: { type: 'key', key: 'debug' },
      }, ctx)).toBe(true)
    })
  })

  describe('string equality (== / !=)', () => {
    it('compares via stringification', () => {
      expect(evaluateWhen('mode == development', ctx)).toBe(true)
      expect(evaluateWhen('mode != production', ctx)).toBe(true)
    })

    it('treats numeric RHS as its string form', () => {
      expect(evaluateWhen('count == 5', { count: 5 })).toBe(true)
      expect(evaluateWhen('count == 5', { count: '5' })).toBe(true)
    })

    it('handles quoted strings on RHS', () => {
      expect(evaluateWhen('mode == "development"', ctx)).toBe(true)
    })
  })

  describe('strict equality (=== / !==)', () => {
    it('distinguishes number from string', () => {
      expect(evaluateWhen('x === 1', { x: 1 })).toBe(true)
      expect(evaluateWhen('x === 1', { x: '1' })).toBe(false)
      expect(evaluateWhen('x !== 1', { x: '1' })).toBe(true)
    })

    it('matches identical strings', () => {
      expect(evaluateWhen('mode === "development"', ctx)).toBe(true)
      expect(evaluateWhen('mode === "production"', ctx)).toBe(false)
    })

    it('compares identifiers on both sides', () => {
      expect(evaluateWhen('a === b', { a: 5, b: 5 })).toBe(true)
      expect(evaluateWhen('a !== b', { a: 5, b: 6 })).toBe(true)
    })
  })

  describe('relational operators', () => {
    it('<', () => {
      expect(evaluateWhen('x < 10', { x: 5 })).toBe(true)
      expect(evaluateWhen('x < 10', { x: 15 })).toBe(false)
    })

    it('>', () => {
      expect(evaluateWhen('x > 10', { x: 15 })).toBe(true)
    })

    it('<=', () => {
      expect(evaluateWhen('x <= 10', { x: 10 })).toBe(true)
      expect(evaluateWhen('x <= 10', { x: 11 })).toBe(false)
    })

    it('>=', () => {
      expect(evaluateWhen('x >= 10', { x: 10 })).toBe(true)
    })
  })

  describe('arithmetic', () => {
    it('addition', () => {
      expect(evaluateWhen('a + b === 5', { a: 2, b: 3 })).toBe(true)
    })

    it('subtraction', () => {
      expect(evaluateWhen('a - b === 1', { a: 3, b: 2 })).toBe(true)
    })

    it('multiplication and division', () => {
      expect(evaluateWhen('a * b === 6', { a: 2, b: 3 })).toBe(true)
      expect(evaluateWhen('a / b === 2', { a: 6, b: 3 })).toBe(true)
    })

    it('modulo', () => {
      expect(evaluateWhen('a % b === 1', { a: 7, b: 3 })).toBe(true)
    })

    it('precedence: * binds tighter than +', () => {
      expect(evaluateWhen('a + b * c === 14', { a: 2, b: 3, c: 4 })).toBe(true)
    })

    it('unary minus', () => {
      expect(evaluateWhen('-x === -5', { x: 5 })).toBe(true)
    })

    it('coerces boolean to number via + (JS semantics)', () => {
      expect(evaluateWhen('a + b === 1', { a: true, b: 0 })).toBe(true)
      expect(evaluateWhen('a + b === 0', { a: false, b: 0 })).toBe(true)
    })
  })

  describe('parentheses', () => {
    it('overrides precedence', () => {
      expect(evaluateWhen('(a + b) * c === 20', { a: 2, b: 3, c: 4 })).toBe(true)
    })

    it('user example: (((a || b) && c) + foo) === 1', () => {
      expect(evaluateWhen('(((a || b) && c) + foo) === 1', {
        a: false,
        b: true,
        c: true,
        foo: 0,
      })).toBe(true)

      expect(evaluateWhen('(((a || b) && c) + foo) === 1', {
        a: false,
        b: false,
        c: true,
        foo: 1,
      })).toBe(true)

      expect(evaluateWhen('(((a || b) && c) + foo) === 1', {
        a: true,
        b: true,
        c: false,
        foo: 0,
      })).toBe(false)
    })
  })

  describe('parse + evaluate composition', () => {
    it('matches evaluateWhen across a range of expressions', () => {
      const expressions = [
        'debug',
        '!verbose',
        'mode == development',
        'debug && !verbose',
        'verbose || mode == development',
        'a && b || c && d',
        '(a || b) && c',
        'x + y > 10',
      ]
      const fullCtx = { ...ctx, a: true, b: false, c: true, d: true, x: 7, y: 8 }
      for (const expr of expressions)
        expect(evaluate(parse(expr), fullCtx)).toBe(evaluateWhen(expr, fullCtx))
    })

    it('supports parse-once evaluate-many', () => {
      const node = parse('debug && mode == development')
      expect(evaluate(node, { debug: true, mode: 'development' })).toBe(true)
      expect(evaluate(node, { debug: true, mode: 'production' })).toBe(false)
      expect(evaluate(node, { debug: false, mode: 'development' })).toBe(false)
    })
  })

  describe('strict mode', () => {
    it('throws on unknown key', () => {
      expect(() => evaluate({ type: 'key', key: 'missing' }, ctx, { strict: true }))
        .toThrow('Unknown context key: "missing"')
    })

    it('does not throw for known key', () => {
      expect(evaluate({ type: 'key', key: 'debug' }, ctx, { strict: true })).toBe(true)
    })

    it('short-circuits through OR', () => {
      const node = parse('debug || missing')
      expect(evaluate(node, ctx, { strict: true })).toBe(true)
    })

    it('short-circuits through AND', () => {
      const node = parse('verbose && missing')
      expect(evaluate(node, ctx, { strict: true })).toBe(false)
    })
  })
})
