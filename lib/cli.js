'use strict';

var _require = require('argparse');

var ArgumentParser = _require.ArgumentParser;

var parser = new ArgumentParser({
  prog: 'nfuse',
  version: require('process').env.npm_package_version,
  addHelp: true,
  description: 'Fuse project integration utility for NPM. Creates a Uno project and Uno source to ease the use of NPM packages in Fuse projects based on an adjacent package.json.'
});

parser.addArgument(['-f', '--force'], {
  defaultValue: false,
  action: 'storeTrue',
  nargs: 0,
  help: 'Force a reconstruction of the package project'
});

module.exports = function () {
  return parser.parseArgs();
};