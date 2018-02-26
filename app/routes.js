var bodyParser = require('body-parser');
var path = require('path');
var Settings = require('./model/settings');
var ShowOrder = require('./model/showOrder');
var Order = require('./model/order');
var Manifest = require('./model/manifest');
var cart3d = require('./3dcart');

// application/x-www-form-urlencoded
var formParser = bodyParser.urlencoded({limit : '50mb'});

module.exports = function(app, passport) {
	// for downloading the qwc file to hook up the web connector
  app.get('/connector', function(req, res) {
    res.download(path.join(__dirname, '../qbws/ec-connector.qwc'), 'ec-connector.qwc')
  });

  // signup page - disabled for now
  /*
  app.post('/signup', formParser, function(req, res, next) {
    passport.authenticate('local-signup', function(err, user, info) {
      if (err) {
        return next(err);
      }

      if (!user) {
        return res.send({
          success : false,
          message : 'That username already exists.'
        });
      } else {
        req.login(user, function(error) {
          if (error) {
            return next(error);
          }
          console.log('Request should have logged in successfully');
          return res.send({
            success : true,
            redirect : '/'
          });
        });
      }
    })(req, res, next);
  });
  */

  app.get('/signup', function(req, res) {
    res.sendFile(path.join(__dirname,'../client', 'signup.html'));
  });

  app.get('/login', function(req, res) {
    res.sendFile(path.join(__dirname,'../client', 'login.html'));
  });

  app.post('/login', formParser, function(req, res, next) {
    passport.authenticate('local-login', function(err, user, info) {
      if (err) {
        return next(err);
      }

      if (!user) {
        return res.send({
          success : false,
          message : info
        });
      } else {
        req.login(user, function(error) {
          if (error) {
            return next(error);
          }
          console.log('Request should have logged in successfully');
          // load the default settings
          Settings.findOne({account: user}, function(err, doc) {
            if (doc) {
              qbws.companyFile = doc.companyFile;
            }
          });
          return res.send({
            success : true,
            redirect : '/'
          });
        });
      }
    })(req, res, next);
  });

  app.get('/customs', function(req, res) {
    var id = req.query.id;
    if (id) {
      var findManifest = Manifest.findOne({_id: id});
      findManifest.then(manifest => {
        res.render('customs', {
          manifest: manifest
        });     
      });
    } else {
      res.render('customs');
    }
  });

  app.get('/new-manifest', function(req, res) {
    var loadOrders = cart3d.loadOrders({
      orderstatus: 4,
      limit: 1
    });
    loadOrders.then((orders) => {
      res.render('new-manifest', {
        orders: orders
      });
    });
  });

  app.get('/3dcart', function(req, res) {
    res.render('3dcart');
  });

  app.get('/user', function(req, res) {
    return res.send(req.user);
  });

  app.get('/inventory', function(req, res) {
    res.render('inventory');
  });

  app.get('/', function(req, res) {
    res.render('home');
  });

  app.get('/orders', function(req, res) {
    res.render('orders');
  });

  app.get('/database', function(req, res) {
    res.render('database');
  });

  app.get('/amazon', function(req, res) {
    res.render('amazon');
  });

  app.get('/new-order', function(req, res) {
    res.render('new-order');
  });

  app.get('/order-import', function(req, res) {
    res.render('order-import');
  });

  app.get('/picksheet', function(req, res) {
    var orderStatus = req.query.orderStatus;
    var orderId = req.query.orderId;
    var id = req.query.id;
    if (id) {
      var findOrder = cart3d.findOne({_id: orderId});
      findOrder.then(order => {
        res.render('picksheet', {
          orders: order
        });
      });
    } else if (orderId) {
      var prefix = orderId.split('-')[0];
      var invoiceId = orderId.split('-')[1];
      var getOrder = cart3d.getOrder({invoicenumber: invoiceId}, prefix == 'CA');
      getOrder.then((orders) => {
        res.render('picksheet', {
          order: orders[0]
        });
      }).catch(err => {
        res.render('picksheet');
      });
    } else if (orderStatus) {
      var usOrders = cart3d.getOrder({orderstatus: orderStatus}, false);
      var canOrders = cart3d.getOrder({orderstatus: orderStatus}, true);

      Promise.all([usOrders, canOrders]).then(responses => {
        var combined = responses[0].concat(responses[1]);
        res.render('picksheet', {
          orders: combined
        });
      });
    } else {
      res.render('print-orders');
    }
  });

  app.get('/show-order', function(req, res) {
    var orderId = req.query.id
    if (orderId) {
      var findOrders = ShowOrder.findOne({_id: orderId});
      findOrders.then((showOrder) => {
        console.log(showOrder);
        res.render('show-order', {
          order: showOrder
        });
      });
    } else {
      res.render('show-order');
    }
  });

  app.get('/list-orders', (req, res) => {
    var findOrders = ShowOrder.find({});
    findOrders.then((showOrders) => {
      res.render('list-orders', {
        orders: showOrders
      });
    });
  });

  app.get('/list-manifests', (req, res) => {
    var findManifests = Manifest.find({}).sort({shipDate: -1});
    findManifests.then(manifests => {
      res.render('list-manifests', {
        manifests: manifests
      });
    });
  });

  app.get('/product-upload', (req, res) => {
    res.render('product-upload');
  });

  app.get('/print-orders', (req, res) => {
    res.render('print-orders');
  });
}