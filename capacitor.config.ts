import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.zdb.personalhub',
  appName: 'Personal Hub',
  webDir: 'dist',
  loggingBehavior: 'none',
  server: {
    cleartext: true,
    androidScheme: 'http',
  },
}

export default config
