'use strict';
var path = require('path');
var gutil = require('gulp-util');
var through = require('through2');
var objectAssign = require('object-assign');
var file = require('vinyl-file');
var vinyl = require('vinyl');
var fs = require('fs');
var revHash = require('rev-hash');
var revPath = require('rev-path');
var sortKeys = require('sort-keys');
var modifyFilename = require('modify-filename');

function relPath(base, filePath) {
  if (filePath.indexOf(base) !== 0) {
    return filePath.replace(/\\/g, '/');
  }

  var newPath = filePath.substr(base.length).replace(/\\/g, '/');

  if (newPath[0] === '/') {
    return newPath.substr(1);
  }

  return newPath;
}

function getManifestFile(opts, cb) {
  file.read(opts.path, opts, function (err, manifest) {
    if (err) {
      // not found
      if (err.code === 'ENOENT') {
        cb(null, new gutil.File(opts));
      } else {
        cb(err);
      }

      return;
    }

    cb(null, manifest);
  });
}

function transformFilename(file) {
  // save the old path for later
  file.revOrigPath = file.path;
  file.revOrigBase = file.base;
  file.revHash = revHash(file.contents);

  file.path = modifyFilename(file.path, function (filename, extension) {
    var extIndex = filename.indexOf('.');

    filename = extIndex === -1 ?
      revPath(filename, file.revHash) :
    revPath(filename.slice(0, extIndex), file.revHash) + filename.slice(extIndex);
    return filename + extension;
  });
}
var thisState = {};
var plugin = function (opt) {

  if(opt && opt.stable){
    if (typeof opt.pth === 'string') {
      var pth = {path: opt.pth};
    }
    var opts = objectAssign({
      path: 'rev-manifest.json',
    }, pth);
    thisState.stable = true;
    var stable = thisState.stable;
    try {
      thisState.oldManifest = JSON.parse(fs.readFileSync(opts.path).toString());
      //console.log(thisState.oldManifest);
    } catch (err) {
      thisState.oldManifest = {};
      //console.log('null');

    }

    var oldManifest = thisState.oldManifest;
  }


  var sourcemaps = [];
  var pathMap = {};

  return through.obj(function (file, enc, cb) {
    if (file.isNull()) {
      cb(null, file);
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('gulp-rev', 'Streaming not supported'));
      return;
    }

    // this is a sourcemap, hold until the end



    if (path.extname(file.path) === '.map') {
      sourcemaps.push(file);
      cb();
      return;
    }

    if(!stable){//没有stable时维持原来的方式
      var oldPath = file.path;
      transformFilename(file);

      // pathMap[oldPath] = file.revHash;
    }else{
      var oldPath = file.path;

      var revKey = path.relative(file.base,file.path);
      if(!oldManifest[revKey]){
        transformFilename(file);
      }else{
        file.revOrigPath = file.path;
        file.revOrigBase = file.base;

        file.path = modifyFilename(file.path, function (filename, extension) {
          var extIndex = revKey.indexOf('.');

          //console.log(oldManifest[revKey]);

          file.revHash = oldManifest[revKey].replace(revKey.slice(0, extIndex)+'-','').replace(revKey.slice(extIndex),'');

          filename = revPath(filename, file.revHash) + extension;

          return filename;
        });
      }
      var newRevHash = revHash(file.contents);
      if(newRevHash != file.revHash){
        //console.log('new hash!!');
        file.isChanged = true;
      }
      // pathMap[oldPath] = file.revHash;
    }




    pathMap[oldPath] = file.revHash;


    cb(null, file);
  }, function (cb) {


    sourcemaps.forEach(function (file) {
      var reverseFilename;

      // attempt to parse the sourcemap's JSON to get the reverse filename
      try {
        reverseFilename = JSON.parse(file.contents.toString()).file;
      } catch (err) {}

      if (!reverseFilename) {
        reverseFilename = path.relative(path.dirname(file.path), path.basename(file.path, '.map'));
      }

      if (pathMap[reverseFilename]) {
        // save the old path for later
        file.revOrigPath = file.path;
        file.revOrigBase = file.base;

        var hash = pathMap[reverseFilename];
        file.path = revPath(file.path.replace(/\.map$/, ''), hash) + '.map';
      } else {
        transformFilename(file);
      }

      this.push(file);
    }, this);

    cb();
  });
};

plugin.manifest = function (pth, opts) {
  if (typeof pth === 'string') {
    pth = {path: pth};
  }

  opts = objectAssign({
    path: 'rev-manifest.json',
    merge: false
  }, opts, pth);

  var firstFileBase = null;
  var manifest = {};

  var stable = thisState.stable;
  //console.log('thisState.stable:'+thisState.stable);

  var changeList = {changeList:[]};

  return through.obj(function (file, enc, cb) {
    // ignore all non-rev'd files
    if (!file.path || !file.revOrigPath) {
      cb();
      return;
    }
    if(stable && file.isChanged){
      changeList.changeList.push(path.relative(file.base,file.path));
    }
    firstFileBase = firstFileBase || file.base;

    var revisionedFile = relPath(firstFileBase, file.path);
    var originalFile = path.join(path.dirname(revisionedFile), path.basename(file.revOrigPath)).replace(/\\/g, '/');

    manifest[originalFile] = revisionedFile;

    cb();
  }, function (cb) {
    // no need to write a manifest file if there's nothing to manifest
    if (Object.keys(manifest).length === 0) {
      cb();
      return;
    }

    getManifestFile(opts, function (err, manifestFile) {
      if (err) {
        cb(err);
        return;
      }

      if (opts.merge && !manifestFile.isNull()) {
        var oldManifest = {};

        try {
          oldManifest = JSON.parse(manifestFile.contents.toString());
        } catch (err) {}

        manifest = objectAssign(oldManifest, manifest);
      }

      manifestFile.contents = new Buffer(JSON.stringify(sortKeys(manifest), null, '  '));
      this.push(manifestFile);

      // if(thisState.stable){
      // 	//changeListFile
      var changeListFile = new vinyl({
        cwd: "",
        base: "",
        path: modifyFilename(opts.path,function (filename, ext) {
          return filename+'-changeList'+ext;
        }),
        contents: new Buffer(JSON.stringify(changeList, null, '  '))
      });
      this.push(changeListFile);
      // }

      cb();
    }.bind(this));
  });
};





module.exports = plugin;
