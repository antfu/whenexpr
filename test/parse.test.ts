import { describe, expect, it } from 'vitest'
import { parse } from '../src/index'

describe('parse', () => {
  describe('literals', () => {
    it('parses booleans', () => {
      expect(parse('true')).toEqual({ type: 'literal', value: true })
      expect(parse('false')).toEqual({ type: 'literal', value: false })
    })

    it('parses integer numbers', () => {
      expect(parse('42')).toEqual({ type: 'literal', value: 42 })
      expect(parse('0')).toEqual({ type: 'literal', value: 0 })
    })

    it('parses decimal numbers', () => {
      expect(parse('1.5')).toEqual({ type: 'literal', value: 1.5 })
      expect(parse('0.25')).toEqual({ type: 'literal', value: 0.25 })
    })

    it('parses double-quoted strings', () => {
      expect(parse('"hello"')).toEqual({ type: 'literal', value: 'hello' })
    })

    it('parses single-quoted strings', () => {
      expect(parse('\'hello\'')).toEqual({ type: 'literal', value: 'hello' })
    })

    it('parses escaped characters in strings', () => {
      expect(parse('"line1\\nline2"')).toEqual({ type: 'literal', value: 'line1\nline2' })
      expect(parse('"a\\"b"')).toEqual({ type: 'literal', value: 'a"b' })
    })
  })

  describe('identifiers', () => {
    it('parses a bare key', () => {
      expect(parse('debug')).toEqual({ type: 'key', key: 'debug' })
    })

    it('parses namespaced keys', () => {
      expect(parse('vite.mode')).toEqual({ type: 'key', key: 'vite.mode' })
      expect(parse('vite:buildMode')).toEqual({ type: 'key', key: 'vite:buildMode' })
    })
  })

  describe('unary', () => {
    it('parses negation', () => {
      expect(parse('!debug')).toEqual({
        type: 'unary',
        op: '!',
        operand: { type: 'key', key: 'debug' },
      })
    })

    it('parses double negation', () => {
      expect(parse('!!debug')).toEqual({
        type: 'unary',
        op: '!',
        operand: {
          type: 'unary',
          op: '!',
          operand: { type: 'key', key: 'debug' },
        },
      })
    })

    it('parses unary minus', () => {
      expect(parse('-5')).toEqual({
        type: 'unary',
        op: '-',
        operand: { type: 'literal', value: 5 },
      })
    })

    it('parses unary plus', () => {
      expect(parse('+x')).toEqual({
        type: 'unary',
        op: '+',
        operand: { type: 'key', key: 'x' },
      })
    })
  })

  describe('equality with VS Code-style RHS', () => {
    it('parses == with bare identifier as string literal', () => {
      expect(parse('mode == development')).toEqual({
        type: 'binary',
        op: '==',
        left: { type: 'key', key: 'mode' },
        right: { type: 'literal', value: 'development' },
      })
    })

    it('parses != with bare identifier as string literal', () => {
      expect(parse('mode != production')).toEqual({
        type: 'binary',
        op: '!=',
        left: { type: 'key', key: 'mode' },
        right: { type: 'literal', value: 'production' },
      })
    })

    it('parses == with quoted string', () => {
      expect(parse('mode == "development"')).toEqual({
        type: 'binary',
        op: '==',
        left: { type: 'key', key: 'mode' },
        right: { type: 'literal', value: 'development' },
      })
    })

    it('parses == with number RHS as its string form', () => {
      expect(parse('count == 5')).toEqual({
        type: 'binary',
        op: '==',
        left: { type: 'key', key: 'count' },
        right: { type: 'literal', value: '5' },
      })
    })
  })

  describe('strict equality with expression RHS', () => {
    it('parses === with number literal', () => {
      expect(parse('x === 1')).toEqual({
        type: 'binary',
        op: '===',
        left: { type: 'key', key: 'x' },
        right: { type: 'literal', value: 1 },
      })
    })

    it('parses !== with identifier on both sides', () => {
      expect(parse('a !== b')).toEqual({
        type: 'binary',
        op: '!==',
        left: { type: 'key', key: 'a' },
        right: { type: 'key', key: 'b' },
      })
    })

    it('parses === with a parenthesized expression on LHS', () => {
      expect(parse('(a + b) === 1')).toEqual({
        type: 'binary',
        op: '===',
        left: {
          type: 'binary',
          op: '+',
          left: { type: 'key', key: 'a' },
          right: { type: 'key', key: 'b' },
        },
        right: { type: 'literal', value: 1 },
      })
    })
  })

  describe('logical operators', () => {
    it('parses && left-associative', () => {
      expect(parse('a && b && c')).toEqual({
        type: 'binary',
        op: '&&',
        left: {
          type: 'binary',
          op: '&&',
          left: { type: 'key', key: 'a' },
          right: { type: 'key', key: 'b' },
        },
        right: { type: 'key', key: 'c' },
      })
    })

    it('parses || left-associative', () => {
      expect(parse('a || b || c')).toEqual({
        type: 'binary',
        op: '||',
        left: {
          type: 'binary',
          op: '||',
          left: { type: 'key', key: 'a' },
          right: { type: 'key', key: 'b' },
        },
        right: { type: 'key', key: 'c' },
      })
    })

    it('binds && tighter than ||', () => {
      expect(parse('a && b || c && d')).toEqual({
        type: 'binary',
        op: '||',
        left: {
          type: 'binary',
          op: '&&',
          left: { type: 'key', key: 'a' },
          right: { type: 'key', key: 'b' },
        },
        right: {
          type: 'binary',
          op: '&&',
          left: { type: 'key', key: 'c' },
          right: { type: 'key', key: 'd' },
        },
      })
    })
  })

  describe('relational operators', () => {
    it('parses <', () => {
      expect(parse('x < 10')).toEqual({
        type: 'binary',
        op: '<',
        left: { type: 'key', key: 'x' },
        right: { type: 'literal', value: 10 },
      })
    })

    it('parses >=', () => {
      expect(parse('x >= 10')).toEqual({
        type: 'binary',
        op: '>=',
        left: { type: 'key', key: 'x' },
        right: { type: 'literal', value: 10 },
      })
    })
  })

  describe('arithmetic', () => {
    it('parses + left-associative', () => {
      expect(parse('a + b + c')).toEqual({
        type: 'binary',
        op: '+',
        left: {
          type: 'binary',
          op: '+',
          left: { type: 'key', key: 'a' },
          right: { type: 'key', key: 'b' },
        },
        right: { type: 'key', key: 'c' },
      })
    })

    it('binds * tighter than +', () => {
      expect(parse('a + b * c')).toEqual({
        type: 'binary',
        op: '+',
        left: { type: 'key', key: 'a' },
        right: {
          type: 'binary',
          op: '*',
          left: { type: 'key', key: 'b' },
          right: { type: 'key', key: 'c' },
        },
      })
    })
  })

  describe('parentheses', () => {
    it('parses a parenthesized key', () => {
      expect(parse('(debug)')).toEqual({ type: 'key', key: 'debug' })
    })

    it('overrides precedence', () => {
      expect(parse('(a + b) * c')).toEqual({
        type: 'binary',
        op: '*',
        left: {
          type: 'binary',
          op: '+',
          left: { type: 'key', key: 'a' },
          right: { type: 'key', key: 'b' },
        },
        right: { type: 'key', key: 'c' },
      })
    })

    it('parses the user example: (((a || b) && c) + foo) === 1', () => {
      expect(parse('(((a || b) && c) + foo) === 1')).toEqual({
        type: 'binary',
        op: '===',
        left: {
          type: 'binary',
          op: '+',
          left: {
            type: 'binary',
            op: '&&',
            left: {
              type: 'binary',
              op: '||',
              left: { type: 'key', key: 'a' },
              right: { type: 'key', key: 'b' },
            },
            right: { type: 'key', key: 'c' },
          },
          right: { type: 'key', key: 'foo' },
        },
        right: { type: 'literal', value: 1 },
      })
    })
  })

  describe('whitespace', () => {
    it('trims around the whole expression', () => {
      expect(parse('   debug   ')).toEqual({ type: 'key', key: 'debug' })
    })

    it('tolerates whitespace around operators', () => {
      expect(parse('a   &&   b')).toEqual({
        type: 'binary',
        op: '&&',
        left: { type: 'key', key: 'a' },
        right: { type: 'key', key: 'b' },
      })
    })
  })

  describe('errors', () => {
    it('throws on unterminated string', () => {
      expect(() => parse('"missing end')).toThrow('Unterminated string literal')
    })

    it('throws on unexpected character', () => {
      expect(() => parse('a @ b')).toThrow('Unexpected character "@"')
    })

    it('throws on missing closing paren', () => {
      expect(() => parse('(a + b')).toThrow('Expected ")"')
    })

    it('throws on trailing garbage', () => {
      expect(() => parse('a b')).toThrow('Unexpected token')
    })
  })
})
