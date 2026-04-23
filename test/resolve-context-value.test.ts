import { describe, expect, it } from 'vitest'
import { resolveContextValue } from '../src/index'

describe('resolveContextValue', () => {
  const ctx = {
    mode: 'development',
    debug: true,
    verbose: false,
  }

  it('returns the value for a known key', () => {
    expect(resolveContextValue('mode', ctx)).toBe('development')
    expect(resolveContextValue('debug', ctx)).toBe(true)
  })

  it('returns undefined for an unknown key', () => {
    expect(resolveContextValue('nonExistent', ctx)).toBeUndefined()
  })

  describe('namespaced keys', () => {
    it('exact match takes priority over nested path', () => {
      const nsCtx = {
        ...ctx,
        'vite.mode': 'flat-value',
        'vite': { mode: 'nested-value' },
      }
      expect(resolveContextValue('vite.mode', nsCtx)).toBe('flat-value')
    })

    it('falls back to nested path when no exact match', () => {
      const nsCtx = {
        ...ctx,
        vite: { mode: 'nested-value' },
      }
      expect(resolveContextValue('vite.mode', nsCtx)).toBe('nested-value')
    })

    it('resolves colon-separated keys via exact match', () => {
      const nsCtx = {
        ...ctx,
        'vite:mode': 'colon-value',
      }
      expect(resolveContextValue('vite:mode', nsCtx)).toBe('colon-value')
    })

    it('resolves colon-separated keys via nested path', () => {
      const nsCtx = {
        ...ctx,
        vite: { mode: 'nested-value' },
      }
      expect(resolveContextValue('vite:mode', nsCtx)).toBe('nested-value')
    })

    it('returns undefined for missing nested path', () => {
      const nsCtx = {
        ...ctx,
        vite: { mode: 'value' },
      }
      expect(resolveContextValue('vite.missing', nsCtx)).toBeUndefined()
    })

    it('handles deeply nested paths', () => {
      const nsCtx = {
        ...ctx,
        plugin: { config: { debug: true } },
      }
      expect(resolveContextValue('plugin.config.debug', nsCtx)).toBe(true)
      expect(resolveContextValue('plugin.config.missing', nsCtx)).toBeUndefined()
    })
  })
})
