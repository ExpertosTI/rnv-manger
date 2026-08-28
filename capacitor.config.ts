import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tech.renace.rnvmanager',
  appName: 'RNV Manager',
  webDir: 'public',
  server: {
    url: 'https://rnv.renace.tech',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0f0e17',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0f0e17',
      showSpinner: true,
      spinnerColor: '#8b5cf6',
    },
  },
};

export default config;
