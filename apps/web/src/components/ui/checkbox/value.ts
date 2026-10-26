export function updateCheckedValue(current: boolean | string[], value: string, checked: boolean) {
  if (!Array.isArray(current)) return checked
  return checked ? [...new Set([...current, value])] : current.filter((item) => item !== value)
}
