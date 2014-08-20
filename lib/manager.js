var path = require('path')
  assetify = require('assetify').instance(),
  assetifyStylus = require('assetify-stylus');

var assetProfiles = {};

// http://jeffijoe.com/2013/08/moving-elements-up-and-down-in-a-javascript-array/
// @todo refactor to a function instead of extending array
Array.prototype.moveUp = function(value, by) {
  var index = this.indexOf(value),
  newPos = index - (by || 1);

  if(index === -1)
    throw new Error('Element not found in array');

  if(newPos < 0)
    newPos = 0;

  this.splice(index,1);
  this.splice(newPos,0,value);
};

// http://jeffijoe.com/2013/08/moving-elements-up-and-down-in-a-javascript-array/
// @todo refactor to a function instead of extending array
Array.prototype.moveDown = function(value, by) {
  var index = this.indexOf(value),
  newPos = index + (by || 1);

  if(index === -1)
    throw new Error('Element not found in array');

  if(newPos >= this.length)
    newPos = this.length;

  this.splice(index, 1);
  this.splice(newPos,0,value);
};

module.exports = {

  initialise: function(app) {

    return {

      compile: function(rootDirectory, callback) {

        // initialise assetify
        assetify.use(assetify.plugins.bundle);
        assetify.use(assetifyStylus);

        var bin = path.join(rootDirectory, 'public');
        assetify.compile({
          assets: {
            explicit: true,
            serve: false,
            source: path.join(rootDirectory, 'public'),
            bin: bin
          }
        }, function(error) {
          assetify(bin);
          app.before('bodyParser').use(assetify.middleware).as('assetify');
          callback(error, app, rootDirectory);
        });
      },

      addFiles: function(assets) {
        if (assets.profile) {
          assetProfiles[assets.profile] = {
            permission: assets.permission,
            after: assets.after,
            before: assets.before
          };
        }

        (assets.js || []).concat(assets.css || []).forEach(function(asset) {
          if (typeof asset !== 'string') {
            if (!assetProfiles[asset.profile]) {
              assetProfiles[asset.profile] = {
                permission: asset.permission || assets.permission,
                after: asset.after || assets.after,
                before: asset.before || assets.before
              };
            }
          }
        });

        assetify.addFiles(assets);
      },

      getAvailableAssetsForUser: function getAvailableAssetsForUser(user) {
        var availableAssets = [];

        Object.keys(assetProfiles).forEach(function(profile) {
          if (!assetProfiles[profile].permission) {
            return availableAssets.push(profile);
          }
          if (!user) {
            return;
          }
          if (user.super || user.hasPermission(assetProfiles[profile].permission)) {
            return availableAssets.push(profile);
          }
        });
        return availableAssets;
      },

      // Ensure assets are ordered according to their dependencies
      applyDependencies: function applyDependencies(profilesToRender) {

        var profilesToRenderModified = false;

        profilesToRender.forEach(function (profile, index) {

          if (profilesToRenderModified) {
            return;
          }

          var dependencies = null,
          dependencyIndex = null;

          if (assetProfiles[profile].after) {
            dependencies = assetProfiles[profile].after;
            if (typeof dependencies == 'string') {
              dependencies = [dependencies];
            }
            dependencies.forEach(function (dependency) {

              if (profilesToRenderModified) {
                return;
              }
              dependencyIndex = profilesToRender.indexOf(dependency);
              if (dependencyIndex == -1) {
                throw new Error('Dependency "' + dependency + '" has not been defined');
              }

              if (dependencyIndex > index) {
                // console.log(dependency + ' > ' + profile);
                profilesToRender.moveUp(dependency, dependencyIndex - index);
                profilesToRenderModified = true;
                return;
              }
            });
          }

          if (assetProfiles[profile].before) {
            dependency = assetProfiles[profile].before;
            dependencyIndex = profilesToRender.indexOf(dependency);
            if (dependencyIndex == -1) {
              throw new Error('Dependency "' + dependency + '" has not been defined');
            }

            if (dependencyIndex < index) {
              // console.log(dependency + ' < ' + profile);
              profilesToRender.moveDown(dependency, index + dependencyIndex);
              profilesToRenderModified = true;
              return;
            }
          }

        });

        if (profilesToRenderModified) {
          return this.applyDependencies(profilesToRender);
        }

        return profilesToRender;
      },

      prepareRenderer: function(app, req, res) {

        function emit(extension, profile) {
          var collector = app.get('assetManager');
          var availableAssets = collector.getAvailableAssetsForUser(req.user);
          var assetsToRender = collector.applyDependencies(availableAssets);

          var tags = [];

          if (assetsToRender.length) {
            assetsToRender.forEach(function(renderProfile) {
              if (res.locals.assetify[extension]) {
                tags.push(res.locals.assetify[extension].emit(renderProfile));
              }
            });
          }

          return tags.join('');
        }

        return {
          js: function renderJs(profile) {
            return emit('js', profile);
          },
          css: function renderCss(profile) {
            return emit('css', profile);
          }
        };
      }
    };
  }
};
