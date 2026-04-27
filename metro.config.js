const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Packages that are native-only and must be stubbed as empty on web.
const WEB_NATIVE_STUBS = [
  '@daily-co/react-native-daily-js',
  '@daily-co/react-native-webrtc',
  'react-native-webrtc',
  'react-native-background-timer',
];

// Zustand v4.5+ ESM (.mjs) builds use import.meta.env which breaks Metro web.
// Force CJS resolution instead.
const zustandPkg = path.dirname(require.resolve('zustand/package.json'));

const _resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Stub native-only packages as empty modules on web
  if (platform === 'web') {
    const isStub = WEB_NATIVE_STUBS.some(
      (pkg) => moduleName === pkg || moduleName.startsWith(pkg + '/')
    );
    if (isStub) return { type: 'empty' };
  }

  // Force zustand to use CJS to avoid import.meta.env
  if (moduleName === 'zustand') {
    return { filePath: path.join(zustandPkg, 'index.js'), type: 'sourceFile' };
  }
  if (moduleName.startsWith('zustand/')) {
    const sub = moduleName.slice('zustand/'.length);
    return { filePath: path.join(zustandPkg, sub + '.js'), type: 'sourceFile' };
  }

  if (_resolveRequest) return _resolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
