module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // expo-router/babel is bundled into babel-preset-expo since SDK 50.
    // react-native-worklets/plugin is required by reanimated v4 — must be LAST.
    plugins: ['react-native-worklets/plugin'],
  };
};
