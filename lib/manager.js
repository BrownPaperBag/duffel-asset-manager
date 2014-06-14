var path = require('path');

var assetProfiles = {};
var assetify = require('assetify').instance();

function moveArrayItem(array, oldIndex, newIndex) {
  while (oldIndex < 0) {
    oldIndex += array.length;
  }
  while (newIndex < 0) {
    newIndex += array.length;
  }
  if (newIndex >= array.length) {
    var k = newIndex - array.length;
    while ((k--) + 1) {
      array.push(undefined);
    }
  }
  array.splice(newIndex, 0, array.splice(oldIndex, 1)[0]);
}

module.exports = {

  initialise: function(app) {

    return {

      compile: function(rootDirectory, callback) {

        // initialise assetify
        assetify.use(assetify.plugins.bundle);

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
                moveArrayItem(profilesToRender, dependencyIndex, index - 1);
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
              moveArrayItem(profilesToRender, dependencyIndex, index + 1);
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
