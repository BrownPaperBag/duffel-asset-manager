var path = require('path');

var assetProfiles = {};
var assetify = require('assetify').instance();

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
          assetProfiles[assets.profile] = assets.permission;
        }

        (assets.js || []).concat(assets.css || []).forEach(function(asset) {
            if (typeof asset !== 'string') {
              assetProfiles[asset.profile] = asset.permission || assets.permission;
            }
          });
        assetify.addFiles(assets);
      },

      getItemsForUser: function getItemsForUser(user) {
        var assetsToRender = [];
        Object.keys(assetProfiles).forEach(function(profile) {
          if (!assetProfiles[profile]) {
            return assetsToRender.push(profile);
          }
          if (!user) {
            return assetsToRender;
          }
          if (user.super || user.hasPermission(assetProfiles[profile])) {
            return assetsToRender.push(profile);
          }
        });
        return assetsToRender;
      },

      prepareRenderer: function(app, req, res) {

        function emit(extension) {
          var collector = app.get('assetManager');
          var assetsToRender = collector.getItemsForUser(req.user);

          var tags = [];

          if (assetsToRender.length) {
            assetsToRender.forEach(function(profile) {
              if (res.locals.assetify[extension]) {
                tags.push(res.locals.assetify[extension].emit(profile));
              }
            });
          }

          return tags.join('');
        }

        return {
          js: function renderJs() {
            return emit('js');
          },
          css: function renderCss() {
            return emit('css');
          }
        };
      }
    };
  }
};
