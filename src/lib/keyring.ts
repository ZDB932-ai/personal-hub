import { shallowRef } from 'vue'

const activeKey = shallowRef<CryptoKey | null>(null)

export function getActiveKey(): CryptoKey | null {
  return activeKey.value
}

export function setActiveKey(key: CryptoKey | null): void {
  activeKey.value = key
}
