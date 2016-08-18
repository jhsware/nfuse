#! /usr/bin/env node

'use strict';

var FUSEPATH = 'fuse';
var Process = require('process');
var Path = require('path');
var FS = require('fs');
var ChildProcess = require('child_process');
var ProjectTools = require('./unoproj');
var Utils = require('./utils');
var resolve = require('./resolve');
var createUnoFile = require('./create-uno');
var ignore = require('fstream-ignore');
var _ = require('lodash');

var cwd = Path.normalize(Process.cwd());

var rootPackage = Utils.loadJsonFromDir({ directory: cwd, filename: 'package.json' });
if (rootPackage == null) {
  console.error('No package.json found in ' + cwd);
  Process.exit(1);
}

var mainProjectPath = ProjectTools.getProjectPathFromDir(cwd);
var mainProject = ProjectTools.loadProjectFromPath(mainProjectPath);
var mainProjectName = ProjectTools.getNameFromProjectDir(cwd);

var moduleProjectDir = cwd + Path.sep + 'NPM-Packages';
var depCachePath = moduleProjectDir + Path.sep + 'dependencies.json';
var moduleProjectPath = Path.join(moduleProjectDir, mainProjectName + '_modules.unoproj');
var previousDeps = Utils.fileExists(depCachePath) ? Utils.loadJson(depCachePath).dependencies : [];
var moduleProject = ProjectTools.createModuleProject();

var includes = [];
var packageDirs = [];

var currentDeps = [];
var newDeps = [];
for (var moduleName in rootPackage.dependencies) {
  currentDeps.push(moduleName + ':' + rootPackage.dependencies[moduleName]);
}previousDeps.sort();
currentDeps.sort();

if (_.isEqual(previousDeps.sort(), currentDeps.sort())) {
  runFuse();
} else {
  Utils.getFilesInDir({ baseDir: moduleProjectDir }).forEach(function (f) {
    return FS.unlinkSync(f);
  });
  buildModuleProject();
}

function buildModuleProject() {
  for (var _moduleName in rootPackage.dependencies) {
    try {
      var _resolve = resolve({ baseDir: cwd, moduleName: _moduleName });

      var files = _resolve.files;
      var dirs = _resolve.dirs;

      packageDirs = packageDirs.concat(dirs);
      files = files.map(function (p) {
        return Path.relative(cwd, p);
      });
      if (files.length == 0) {
        console.error('Couldn\'t resolve dependency \'' + _moduleName + '\', make sure to run \'npm install\'');
        Process.exit(1);
      }
      includes = includes.concat(files.map(function (f) {
        return Path.relative(moduleProjectDir, f);
      }));
      var filePath = createUnoFile({
        name: _moduleName,
        mainPath: Path.relative(moduleProjectDir, files[0]),
        projectname: mainProjectName + '_modules',
        outDir: moduleProjectDir
      });
      newDeps.push(_moduleName + ':' + rootPackage.dependencies[_moduleName]);
      includes.push(Path.relative(moduleProjectDir, filePath));
    } catch (e) {
      console.error(e);
      Process.exit(1);
    }
  }
  step();
}

function step() {
  if (packageDirs.length > 0) collate(packageDirs.shift(), includes);else finish();
}

function collate(dir, out) {
  ignore({ path: dir, ignoreFiles: ['.npmignore', '.gitignore'] }).on('child', function (c) {
    var ext = Path.extname(c.path);
    if (ext != '.js' || ext != '.unoproj') return;
    var relativePath = Path.relative(moduleProjectDir, c.path);
    if (out.indexOf(relativePath) == -1) out.push(relativePath);
  }).on('end', step);
}

function finish() {
  ProjectTools.addIncludes({ project: moduleProject, includesArray: includes });
  Utils.saveJson({ obj: moduleProject, path: moduleProjectPath });
  ProjectTools.addProjects({ project: mainProject, projectsArray: [Path.relative(cwd, moduleProjectPath)] });
  ProjectTools.addExcludes({ project: mainProject, excludesArray: ['node_modules', 'NPM-Packages'] });
  Utils.saveJson({ obj: mainProject, path: mainProjectPath });
  Utils.saveJson({ obj: { 'dependencies': newDeps }, path: depCachePath });
  runFuse();
}

function runFuse() {
  var args = Process.argv.slice(2);
  if (args.length > 0) {
    var first = args.shift();
    var fuseArgs = [first].concat(args);
    var fuse = ChildProcess.spawn(FUSEPATH, fuseArgs);

    var write = function write(data) {
      return Process.stdout.write(data);
    };

    fuse.stdout.on('data', write);
    fuse.stderr.on('data', write);

    fuse.on('close', function (code) {
      return console.log('Fuse exited with code ' + code);
    });
  }
}