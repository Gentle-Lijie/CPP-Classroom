export const EMPTY_SELECT_VALUE = '__classroom_empty_selection__'
export function selectValue(value: string | number) {
  return value === '' ? EMPTY_SELECT_VALUE : String(value)
}
