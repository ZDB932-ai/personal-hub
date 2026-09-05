import { Capacitor } from '@capacitor/core'

const FLAG_KEY = 'xk.biometric.v1'
const SERVER = 'personal-hub'
const USERNAME = 'master'

export function biometricEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function setBiometricEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(FLAG_KEY, '1')
    else localStorage.removeItem(FLAG_KEY)
  } catch {
    /* ignore */
  }
}

export async function biometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
    const res = await NativeBiometric.isAvailable({ useFallback: false })
    return Boolean(res.isAvailable)
  } catch {
    return false
  }
}

export async function biometricStoreSecret(password: string): Promise<void> {
  const mod = await import('@capgo/capacitor-native-biometric')
  await mod.NativeBiometric.setCredentials({
    server: SERVER,
    username: USERNAME,
    password,
    accessControl: mod.AccessControl.BIOMETRY_ANY,
    title: '保护主密码',
    negativeButtonText: '取消',
  })
}

export async function biometricGetSecret(reason: string): Promise<string | null> {
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
    const cred = await NativeBiometric.getSecureCredentials({
      server: SERVER,
      reason,
      title: '解锁 Personal Hub',
      negativeButtonText: '取消',
    })
    return cred.password ?? null
  } catch {
    return null
  }
}

export async function biometricClear(): Promise<void> {
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric')
    await NativeBiometric.deleteCredentials({ server: SERVER })
  } catch {
    /* ignore */
  }
  setBiometricEnabled(false)
}
