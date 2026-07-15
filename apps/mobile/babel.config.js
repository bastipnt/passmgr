module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo bundles the reanimated/worklets plugin. Uniwind needs
    // no babel preset of its own (classes are compiled in the Metro transform).
    presets: ["babel-preset-expo"],
  };
};
