const path = require('path');

const extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
  '@cresc/core': path.resolve(__dirname, '../..'),
  '@babel/runtime': path.resolve(__dirname, 'node_modules/@babel/runtime'),
};
const watchFolders = [path.resolve(__dirname, '../..')];

module.exports = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    extraNodeModules,
  },
  watchFolders,
};
