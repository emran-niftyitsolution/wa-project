const nodeExternals = require('webpack-node-externals');
const path = require('path');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');

module.exports = function (options, webpack) {
  return {
    ...options,
    entry: ['webpack/hot/poll?100', options.entry],
    resolve: {
      ...options.resolve,
      alias: {
        ...options.resolve?.alias,
        // Fix webpack resolving 'mongoose' as relative path when bundling category DTOs
        mongoose: path.resolve(__dirname, 'node_modules/mongoose'),
        '../../../mongoose': path.resolve(__dirname, 'node_modules/mongoose'),
      },
    },
    externals: [
      nodeExternals({
        allowlist: ['webpack/hot/poll?100'],
      }),
    ],
    plugins: [
      ...options.plugins,
      new webpack.HotModuleReplacementPlugin(),
      new webpack.WatchIgnorePlugin({
        paths: [/\.js$/, /\.d\.ts$/],
      }),
      new RunScriptWebpackPlugin({
        name: options.output.filename,
        autoRestart: false,
      }),
    ],
  };
};
