import { describe, expect, it } from 'vitest'
import { APP_NAME } from '@shared/app'
import { App } from '@renderer/App'

describe('smoke', () => {
  it('resolves the @shared and @renderer aliases', () => {
    expect(APP_NAME).toBe('AI Shorts Studio')
    expect(typeof App).toBe('function')
  })
})
