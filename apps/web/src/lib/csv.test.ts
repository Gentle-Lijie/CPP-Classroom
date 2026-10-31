import { describe, expect, it } from 'vitest'
import { csvDocument, parseRoster, rosterContent } from './csv'

describe('student roster CSV', () => {
  it('keeps leading zeroes and supports BOM, headers, tabs and quoted commas', () => {
    expect(parseRoster('\uFEFF姓名,学号\r\n"王,明",00123')).toEqual([
      { name: '王,明', number: '00123' },
    ])
    expect(parseRoster('姓名\t学号\n王明\t0001')).toEqual([{ name: '王明', number: '0001' }])
  })
  it('rejects partial, duplicate and oversized imports before adding anyone', () => {
    expect(() => parseRoster('王明,1\n王明,1')).toThrow('重复')
    expect(() => parseRoster('王明,')).toThrow('完整')
    expect(() => parseRoster('"王明,1')).toThrow('引号')
    expect(() => parseRoster(Array.from({ length: 51 }, (_, i) => `学生,${i}`).join('\n'))).toThrow(
      '50',
    )
  })
  it('escapes quotes and prevents formula execution in exported cells', () => {
    expect(csvDocument([['=HYPERLINK("evil")', 'a,b']])).toBe(
      '\uFEFF"\'=HYPERLINK(""evil"")","a,b"',
    )
  })
  it('accepts optional credentials with headers, without headers and from Excel paste', () => {
    const student = { name: '王明', number: '00123', username: 'wang.ming', password: '001234' }
    expect(parseRoster('姓名,学号,用户名,密码\n王明,00123,wang.ming,001234')).toEqual([student])
    expect(parseRoster('王明\t00123\twang.ming\t001234')).toEqual([student])
    expect(
      parseRoster('\r\n \t\r\n姓名\t学号\t用户名\t密码\r\n王明\t00123\twang.ming\t001234'),
    ).toEqual([student])
    expect(parseRoster('name,number,username,password\n王明,00123,wang.ming,001234')).toEqual([
      student,
    ])
    expect(parseRoster('王明,00123,,\n李四,002,li.si\n张三,003,,123456')).toEqual([
      { name: '王明', number: '00123' },
      { name: '李四', number: '002', username: 'li.si' },
      { name: '张三', number: '003', password: '123456' },
    ])
    expect(parseRoster('姓名\t学号\t初始密码\n王明\t00123\t123456')).toEqual([
      { name: '王明', number: '00123', password: '123456' },
    ])
    expect(parseRoster('姓名,学号,密码,登录账号\n王明,00123,123456,wang.ming')).toEqual([
      { ...student, password: '123456' },
    ])
  })
  it('preserves exact passwords through import and failed-row serialization', () => {
    const rows = [
      { name: '王,明', number: '00123', username: 'wang.ming', password: '  @pass,"word"\t\n  ' },
      { name: '李四', number: '002', password: '  ' },
      { name: '张三', number: '003' },
    ]
    expect(parseRoster(rosterContent(rows))).toEqual(rows)
    expect(parseRoster(' 王明 , 00123 , wang.ming ,  password  ')).toEqual([
      { name: '王明', number: '00123', username: 'wang.ming', password: '  password  ' },
    ])
    expect(parseRoster('王明,00123,wang.ming,"pass\tword"')).toEqual([
      { name: '王明', number: '00123', username: 'wang.ming', password: 'pass\tword' },
    ])
  })
  it('validates all credential columns before any account request', () => {
    for (const username of ['中文', 'has space', 'a'.repeat(81)])
      expect(() => parseRoster(`学生,1,${username}`)).toThrow('用户名仅限')
    expect(() => parseRoster(`学生,1,,${'a'.repeat(201)}`)).toThrow('密码超过')
    expect(() => parseRoster('学生,1,same\n学生,2,same')).toThrow('用户名 same 重复')
    expect(() => parseRoster('学生,1,account,password,extra')).toThrow('列数')
    expect(() => parseRoster('姓名,学号,用户名,备注\n学生,1,account,extra')).toThrow('表头')
    expect(() => parseRoster('姓名,学号,用户名,登录账号\n学生,1,a,b')).toThrow('不能重复')
    expect(() => parseRoster('姓名,学号\n学生,1,account')).toThrow('列数')
    expect(parseRoster(`学生,1,${'a'.repeat(80)},${'a'.repeat(200)}`)).toHaveLength(1)
  })
})
