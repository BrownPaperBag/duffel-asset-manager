module.exports = function(app) {

  app.set('assetManager', require('./manager').initialise(app));

  /**
   * Add the assets object to template locals.
   *
   * @param {Object} req The request object.
   * @param {Object} res The response object.
   * @param {Function} next
   */
  app.before('router').use(function visorLocals(req, res, next) {
    res.locals.assetManager = app.get('assetManager').prepareRenderer(app, req, res);
    next();
  }).as('assetManager');
};

