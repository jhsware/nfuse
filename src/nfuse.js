#! /usr/bin/env node
'use strict'
const FUSEPATH = 'fuse'
const Process = require('process')
const Path = require('path')
const FS = require('fs')
const ChildProcess = require('child_process')
const ProjectTools = require('./unoproj')
const Utils = require('./utils')
const resolve = require('./resolve')
const createUnoFile = require('./create-uno')
const ignore = require('fstream-ignore')
const _ = require('lodash')

const cwd = Path.normalize(Process.cwd())

const rootPackage = Utils.loadJsonFromDir({directory:cwd, filename:'package.json'})
if(rootPackage==null){
  console.error(`No package.json found in ${cwd}`)
  Process.exit(1)
}

const mainProjectPath = ProjectTools.getProjectPathFromDir(cwd) 
const mainProject = ProjectTools.loadProjectFromPath(mainProjectPath)
const mainProjectName = ProjectTools.getNameFromProjectDir(cwd)

const moduleProjectDir = cwd + Path.sep + 'NPM-Packages'
const depCachePath = moduleProjectDir + Path.sep + 'dependencies.json'
const moduleProjectPath = Path.join(moduleProjectDir, mainProjectName + '_modules.unoproj')
let previousDeps = Utils.fileExists(depCachePath) ? Utils.loadJson(depCachePath).dependencies : []
const moduleProject = ProjectTools.createModuleProject()


let includes = []
let packageDirs = []

let currentDeps = []
let newDeps = []
for(let moduleName in rootPackage.dependencies)
  currentDeps.push(moduleName+':'+rootPackage.dependencies[moduleName])
  
previousDeps.sort()
currentDeps.sort()
  
if(_.isEqual(previousDeps.sort(), currentDeps.sort())) {
  runFuse()
} else {
  Utils.getFilesInDir({baseDir:moduleProjectDir})
    .forEach(f => FS.unlinkSync(f) )
  buildModuleProject()
}

function buildModuleProject()
{
  for(let moduleName in rootPackage.dependencies) {
    try{
      let {files, dirs} = resolve({baseDir:cwd, moduleName:moduleName})
      packageDirs = packageDirs.concat(dirs)
      files = files.map(p => Path.relative(cwd, p))
      if(files.length==0){
        console.error(`Couldn't resolve dependency '${moduleName}', make sure to run 'npm install'`)
        Process.exit(1)
      } 
      includes = includes.concat(files.map(f => Path.relative(moduleProjectDir, f)))
      let filePath = createUnoFile({
        name : moduleName, 
        mainPath : Path.relative(moduleProjectDir, files[0]),
        projectname : mainProjectName + '_modules',
        outDir : moduleProjectDir
      })
      newDeps.push(moduleName+':'+rootPackage.dependencies[moduleName])
      includes.push(Path.relative(moduleProjectDir, filePath))
    }catch(e){
      console.error(e)
      Process.exit(1)
    }
  }
  step()
}

function step() {
  if(packageDirs.length>0)
    collate(packageDirs.shift(), includes)
  else
    finish()
}

function collate(dir, out) {
  ignore({ path: dir, ignoreFiles: ['.npmignore', '.gitignore'] })
    .on('child', c => {
      const ext = Path.extname(c.path)
      if(ext != '.js' || ext != '.unoproj') return
      let relativePath = Path.relative(moduleProjectDir, c.path)
      if(out.indexOf(relativePath) == -1) out.push(relativePath)
    }) 
    .on('end', step)
}

function finish()
{
  ProjectTools.addIncludes({project:moduleProject, includesArray:includes})
  Utils.saveJson({obj:moduleProject, path:moduleProjectPath})
  ProjectTools.addProjects({project:mainProject, projectsArray:[Path.relative(cwd, moduleProjectPath)]})
  ProjectTools.addExcludes({project:mainProject, excludesArray:['node_modules', 'NPM-Packages']})
  Utils.saveJson({obj:mainProject, path:mainProjectPath})
  Utils.saveJson({obj:{'dependencies':newDeps}, path:depCachePath})
  runFuse()
}

function runFuse()
{
  let args = Process.argv.slice(2)
  if(args.length>0) {
    const first = args.shift()
    const fuseArgs = [first].concat(args)
    const fuse = ChildProcess.spawn(FUSEPATH, fuseArgs)
    
    const write = data => Process.stdout.write(data)

    fuse.stdout.on('data', write)
    fuse.stderr.on('data', write)

    fuse.on('close', code => 
      console.log(`Fuse exited with code ${code}`)
    )
  }
}