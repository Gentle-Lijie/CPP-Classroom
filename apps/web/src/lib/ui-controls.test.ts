import { afterEach, describe, expect, it } from 'vitest'
import { updateCheckedValue } from '../components/ui/checkbox/value'
import { EMPTY_SELECT_VALUE, selectValue } from '../components/ui/select/value'
import { confirmAction, confirmation, resolveConfirmation } from './confirm'

afterEach(() => resolveConfirmation(false))

describe('component control values', () => {
  it('preserves selected rows from other pages without duplicates', () => {
    const selected = ['other-page', 'current-row']
    expect(updateCheckedValue(selected, 'current-row', true)).toEqual(selected)
    expect(updateCheckedValue(selected, 'current-row', false)).toEqual(['other-page'])
    expect(selected).toEqual(['other-page', 'current-row'])
  })
  it('keeps boolean controls independent of checkbox values', () => {
    expect(updateCheckedValue(false, 'unused', true)).toBe(true)
    expect(updateCheckedValue(true, 'unused', false)).toBe(false)
  })
  it('distinguishes an empty filter from the numeric zero option', () => {
    expect(selectValue('')).toBe(EMPTY_SELECT_VALUE)
    expect(selectValue(0)).toBe('0')
    expect(selectValue(20)).toBe('20')
  })
})

describe('navigation confirmation', () => {
  it('waits for an explicit answer and clears the pending dialog', async () => {
    const answer = confirmAction('Unsaved changes')
    expect(confirmation.value?.message).toBe('Unsaved changes')
    resolveConfirmation(false)
    expect(await answer).toBe(false)
    expect(confirmation.value).toBeUndefined()
  })
  it('cancels a superseded request and resolves the current choice', async () => {
    const first = confirmAction('First page')
    const second = confirmAction('Second page')
    expect(await first).toBe(false)
    resolveConfirmation(true)
    expect(await second).toBe(true)
  })
})
