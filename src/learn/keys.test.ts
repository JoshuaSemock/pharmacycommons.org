import { describe, expect, it } from 'vitest'
import { optionKey } from './keys'

describe('optionKey', () => {
  it('maps number keys to 0-based option indexes', () => {
    expect(optionKey({ code: 'Digit1', key: '1', shiftKey: false }, 4)).toEqual({ index: 0, unsure: false })
    expect(optionKey({ code: 'Digit4', key: '4', shiftKey: false }, 4)).toEqual({ index: 3, unsure: false })
    expect(optionKey({ code: 'Numpad2', key: '2', shiftKey: false }, 4)).toEqual({ index: 1, unsure: false })
  })

  it('treats Shift+number as a guess, even though key becomes a symbol', () => {
    expect(optionKey({ code: 'Digit3', key: '#', shiftKey: true }, 4)).toEqual({ index: 2, unsure: true })
  })

  it('falls back to key when there is no code', () => {
    expect(optionKey({ key: '2', shiftKey: false }, 3)).toEqual({ index: 1, unsure: false })
  })

  it('ignores numbers beyond the option count, zero and other keys', () => {
    expect(optionKey({ code: 'Digit4', key: '4', shiftKey: false }, 3)).toBeNull()
    expect(optionKey({ code: 'Digit0', key: '0', shiftKey: false }, 4)).toBeNull()
    expect(optionKey({ code: 'KeyA', key: 'a', shiftKey: false }, 4)).toBeNull()
    expect(optionKey({ code: 'Enter', key: 'Enter', shiftKey: false }, 4)).toBeNull()
  })
})
