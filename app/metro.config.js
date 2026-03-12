const path = require("path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const sdkRoot = path.resolve(workspaceRoot, "packages/mobile-rppg-acquisition-sdk");

const config = {
  watchFolders: [workspaceRoot, sdkRoot],
  resolver: {
    nodeModulesPaths: [path.resolve(workspaceRoot, "node_modules")],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
