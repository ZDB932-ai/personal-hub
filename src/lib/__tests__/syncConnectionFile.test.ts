import { expect, it } from 'vitest'
import { DEFAULT_SYNC_SERVER, parseSyncConnectionFile } from '../syncConnectionFile'

const file = { format: 'personal-hub-sync', version: 1, url: DEFAULT_SYNC_SERVER, token: 'a'.repeat(43) }
it('导入连接文件并规范化 HTTPS 地址', () => {
  expect(parseSyncConnectionFile(JSON.stringify({ ...file, url: file.url + '/' }))).toEqual({ url: file.url, token: file.token })
})
it('拒绝非连接文件、无效令牌和明文公网地址', () => {
  for (const value of [{}, { ...file, version: 2 }, { ...file, token: 'short' }, { ...file, url: 'http://111.91.19.235' }, { ...file, url: file.url + '/v1' }, { ...file, url: 'https://user:secret@111.91.19.235' }]) {
    expect(() => parseSyncConnectionFile(JSON.stringify(value))).toThrow()
  }
  expect(() => parseSyncConnectionFile('x'.repeat(4097))).toThrow('过大')
})
