var bodyParser = require('body-parser');
var path = require('path');
var Settings = require('./model/settings');
var ShowOrder = require('./model/showOrder');
var Order = require('./model/order');
var Batch = require('./model/batch');
var Customer = require('./model/customer');
var CustomOrder = require('./model/customOrder');
const User = require('./model/user');
const Company = require('./model/company');
var PurchaseOrder = require('./model/purchaseOrder');
var Item = require('./model/item');
var Manifest = require('./model/manifest');
var cart3d = require('./3dcart');
var reporting = require('./reporting');
var helpers = require('./helpers');
var request = require('request');
var rp = require('request-promise-native');
var moment = require('moment');
var formParser = bodyParser.urlencoded({limit : '50mb'});

async function verifyUser(req, res, next) {
  if (req.session.userId == undefined || req.session.userId == null) {
    res.render('login', {
      error: 'Your session has expired. Please login again.'
    });
  } else {
    req.session.user = await User.findOne({_id: req.session.userId}).populate('defaultCompany').exec();
    // await req.session.user.defaultCompany.populate('marketplaces').execPopulate();
    next();
  }
}

module.exports = app => {
	// for downloading the qwc file to hook up the web connector
  app.get('/connector', function(req, res) {
    res.download(path.join(__dirname, '../qbws/ec-connector.qwc'), 'ec-connector.qwc')
  });

  app.get('/customs', function(req, res) { // DEPRECATED
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

  app.get('/', verifyUser, (req, res) => {
    var today = moment();
    var yesterday = today.clone(); //.subtract(24, 'hours');
    yesterday.subtract(1, 'days');

    reporting.getOrderReport(yesterday, today, [1, 2, 3, 6, 9, 13, 4])
    .then(responses => {
      var total = 0;
      responses.forEach(x => total += x.TotalCount);
      cart3d.loadItems({
        countonly: 1
      }, false).then( response => {
        res.render('home', {
          todaysOrders: total,
          totalItems: response.TotalCount
        });
      });
    });
  });

  app.get('/login', (req, res) => {
    res.render('login');
  });

  app.get('/register', (req, res) => {
    res.render('register');
  });
  
  app.post('/login', (req, res) => {
    User.authenticate(req.body.email, req.body.password).then(result => {
      if (result.success === true) {
        req.session.userId = result.userId;
        var referer = req.get('Referer');
        console.log(referer);
        if (referer.includes('/login') || referer.includes('/register')) {
          res.redirect('/');
        } else {
          res.redirect(referer);
        }
      } else {
        res.render('login', {
          error: result.error
        });
      }
    }).catch(err => {
      console.log('Error authenticating the user');
      console.log(err);
      res.redirect('/');
    });
  });

  app.post('/register', (req, res) => {
    User.create(req.body).then(user => {
      res.session.userId = user._id;
      res.redirect('/home');
    }).catch(err => {
      res.render('login', {
        error: 'User already exists. Please login.',
        email: req.body.email
      });
    });
  });

  // ORDERS
  app.get('/orders', verifyUser, async (req, res) => {
    Order.find({}).limit(10).sort('-orderDate').populate('customer').then(async recentOrders => {
      let batches = await Batch.find({completed: false}).populate('picker').sort('-startTime').exec();
      let unpickedOrders = await Order.find({picked: false, hold: false}).populate('customer').exec();
      let heldOrders = await Order.find({hold: true}).populate('customer').sort('orderDate').exec();
      res.render('orders', {
        recentOrders: recentOrders,
        user: req.session.user,
        batches: batches,
        unpicked: unpickedOrders,
        heldOrders: heldOrders
      });
    });
  });

  app.get('/order', verifyUser, (req, res) => {
    let id = req.query.id;
    if (id) {
      res.redirect('/orders/view/'+id);
    } else {
      res.redirect('/orders');
    }
  });

  app.get('/orders/view/:orderId', verifyUser, (req, res) => {
    Order.findOne({_id: req.params.orderId}).populate('customer').populate('backorders').populate({
      path: 'items.item',
      model: 'Item',
      populate: {
        path: 'parent',
        model: 'Item'
      }
    }).then(order => {
      if (order) {
        getCustomerType(order).then(() => {
          res.render('order', {
            order: order,
            user: req.session.user
          });
        });
      } else {
        res.redirect('/orders');
      }
    });
  });

  app.get('/print-orders', verifyUser, (req, res) => {
    res.redirect('/orders/pick');
  });

  app.get('/orders/pick', verifyUser, (req, res) => {
    Order.find({picked: false, batch: null, hold: false}).populate('customer').sort('orderDate').then(orders => {
      res.render('print-orders', {
        orders: orders,
        user: req.session.user
      });
    });
  });

  app.get('/order-dashboard', verifyUser, (req, res) => {
    res.redirect('/orders');
  });

  app.get('/batch', verifyUser, (req, res) => {
    let id = req.query.id;
    if (id) {
      res.redirect('/batch/'+id);
    } else {
      res.redirect('/batches');
    }
  });

  app.get('/batch/:batchId', verifyUser, (req, res) => {
    loadBatch(req.params.batchId).then(batch => {
      if (batch) {
        res.render('batch', {
          batch: batch,
          user: req.session.user
        });
      } else {
        res.redirect('/batches');
      }
    });
  });

  app.get('/batch/confirm/:batchId', verifyUser, async (req, res) => {
    let batch = await loadBatch(req.params.batchId);
    res.render('confirm-batch', {
      batch: batch,
      user: req.session.user
    });
  });

  app.get('/packing-slip', (req, res) => {
    res.redirect('/batch/slips/'+req.query.id);
  });

  app.get('/batch/slips/:batchId', verifyUser, async (req, res) => {
    let batch = await loadBatch(req.params.batchId);
    if (batch) {
      var promises = [];
      batch.orders.forEach(o => {
        promises.push(getCustomerType(o));
      });
      Promise.all(promises).then(r => {
        res.render('packing-slip', {
          batch: batch,
          user: req.session.user
        });
      });
    } else {
      res.redirect('/batches');
    }
  });

  app.get('/sort-batch', verifyUser, async (req, res) => {
    var shortid = req.query.shortid;
    var id;
    if (shortid) {
      var batch = await Batch.findOne({shortid: shortid});
      if (batch)
        id = batch._id;
      else 
        return res.redirect('/batches');
    } else {
      id = req.query.id;
    }
    loadBatch(id).then(batch => {
      if (batch) {
        res.render('sort-batch', {
          batch: batch,
          user: req.session.user
        });
      } else {
        res.redirect('/batches');
      }
    });
  });

  app.get('/batch-sheet', async (req, res) => {
    var shortid = req.query.shortid;
    var id;
    if (shortid) {
      var batch = await Batch.findOne({shortid: shortid});
      id = batch._id;
    } else {
      id = req.query.id;
    }
    loadBatch(id).then(batch => {
      if (batch) {
        res.render('batch-sheet', {
          batch: batch
        });
      } else {
        res.redirect('/batches');
      }
    });
  });

  app.get('/batch/print/:batchId', verifyUser, async (req, res) => {
    let batch = await Batch.findOne({shortid: req.params.batchId});
    if (batch) {
      batch = await loadBatch(batch._id);
      res.render('batch-sheet', {
        batch: batch,
        user: req.session.user
      });
    } else {
      res.redirect('/batches');
    }
  });

  app.get('/batches', verifyUser, (req, res) => {
    Batch.find({}).populate('picker').then(batches => {
      res.render('batches', {
        batches: batches,
        user: req.session.user
      });
    });
  });

  app.get('/list-orders', verifyUser, (req, res) => {
    var findOrders = CustomOrder.find({}).sort({lastModified: -1}).limit(100);
    findOrders.then((customOrders) => {
      res.render('list-orders', {
        orders: customOrders,
        user: req.session.user
      });
    });
  });

  app.get('/inventory', function(req, res) {
    res.render('inventory');
  });

  app.get('/order-sync', function(req, res) {
    res.render('order-sync');
  });

  app.get('/database', function(req, res) {
    res.render('database');
  });

  app.get('/amazon', function(req, res) {
    res.render('amazon');
  });

  app.get('/new-order', verifyUser, function(req, res) {
    var customId = req.query.id;
    if (customId) {
      CustomOrder.findOne({_id: customId}).then(cOrder => {
        res.render('new-order', {
          customOrder: cOrder,
          user: req.session.user
        });
      });
    } else {
      res.render('new-order', {
        user: req.session.user
      });
    }
  });

  app.get('/order-import', function(req, res) {
    res.render('order-import');
  });

  app.get('/pick-order', (req, res) => {
    var orderId = req.query.orderId;
    if (orderId) {
      getCartOrder(orderId).then(order => {
        res.render('pick-order', {
          order: order
        });
      });
    } else {
      res.redirect('print-orders');
    }
  });

  // dep
  app.get('/invoice', (req, res) => {
    var orderId = req.query.orderId;
    if (orderId) {
      getCartOrder(orderId).then(order => {
        res.render('invoice', {
          order: order
        });
      });
    } else {
      res.redirect('/');
    }
  });

  app.get('/invoice-home', (req, res) => {
    Batch.find({completed: true}).then(batches => {
      res.render('invoice-home', {
        batches: batches
      });
    });
  });

  app.get('/invoice-batch', (req, res) => {
    loadBatch(req.query.id).then(batch => {
      if (batch) {
        res.render('invoice-batch', {
          batch: batch
        });
      } else {
        res.redirect('invoice-home');
      }
    }).catch(err => {
      res.redirect('invoice-home');
    });
  });

  function getCartOrder(orderId) {
    var prefix = orderId.split('-')[0];
    var invoiceId = orderId.split('-')[1];
    var getOrder = cart3d.getOrder({invoicenumber: invoiceId}, prefix == 'CA');
    var promises = [];
    return getOrder.then((orders) => {
      var order = orders[0];
      var setItems = helpers.setItemFieldsForAmazon(order);
      var updateCustomer = cart3d.searchCustomer(order.BillingEmail, order.InvoiceNumberPrefix == 'CA-');
      var setCustomer = updateCustomer.then(customers => {
        if (customers[0]) {
          order.CustomerGroupID = customers[0].CustomerGroupID;
        } else {
          order.CustomerGroupID = 0;
        }
      });
      promises.push(setItems);
      promises.push(setCustomer);
      return Promise.all(promises).then(() => {
        return order;
      });
    });
  }

  app.get('/picksheet', function(req, res) {
    var orderStatus = req.query.orderStatus;
    var orderId = req.query.orderId;
    var id = req.query.id;
    if (id) {
      var findOrder = Order.findOne({_id: orderId});
      findOrder.then(order => {
        res.render('picksheet', {
          orders: order
        });
      });
    } else if (orderId) {
      getCartOrder(orderId).then(order => {
        console.log(order);
        res.render('picksheet', {
          order: order
        });
      }).catch(err => {
        console.log(err);
        res.render('picksheet');
      });
    } else if (orderStatus) {
      var usOrders = cart3d.getOrder({orderstatus: orderStatus, limit: 300}, false);
      var canOrders = cart3d.getOrder({orderstatus: orderStatus, limit: 300}, true);
      var promises = [];
      Promise.all([usOrders, canOrders]).then(responses => {
        var combined = responses[0].concat(responses[1]);
        combined.sort((a, b) => {
          var keyA = a.InvoiceNumberPrefix+a.InvoiceNumber;
          var keyB = b.InvoiceNumberPrefix+b.InvoiceNumber;

          if (keyA < keyB) return -1;
          if (keyA > keyB) return 1;
          return 0; 
        });

        combined.forEach(order => {
          var setFields = helpers.setItemFieldsForAmazon(order);
          var updateCustomer = cart3d.searchCustomer(order.BillingEmail, order.InvoiceNumberPrefix == 'CA-');
          var setCustomer = updateCustomer.then(customers => {
            if (customers[0]) {
              order.CustomerGroupID = customers[0].CustomerGroupID;
            } else {
              order.CustomerGroupID = 0;
            }
          });
          promises.push(setFields);
          promises.push(setCustomer);
        });

        Promise.all(promises).then(() => {
          res.render('picksheet', {
            orders: combined
          });
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
        res.render('show-order', {
          order: showOrder
        });
      });
    } else {
      res.render('show-order');
    }
  });

  app.get('/list-manifests', (req, res) => {
    var findManifests = Manifest.find({}).sort({shipDate: -1});
    findManifests.then(manifests => {
      res.render('list-manifests', {
        manifests: manifests
      });
    });
  });

  app.get('/manifest/:shipDate', (req, res) => {
    var shipDate = req.params.shipDate;
    var startDate = moment(shipDate).utc().startOf('day');
    var endDate = moment(shipDate).utc().endOf('day');
    Order.find({shipDate: {$gte: startDate.toDate(), $lt: endDate.toDate()}, canadian: false, hold: false, picked: true}).populate('items.item').then(orders => {
      console.log('found ' + orders.length + ' orders with that ship date');
      res.render('manifest', {
        orders: orders,
        shipDate: shipDate
      });
    });
  });

  app.get('/product-upload', (req, res) => {
    res.render('product-upload');
  });

  app.get('/deliveries', (req, res) => {
    res.render('deliveries');
  });

  app.get('/purchase-orders', (req, res) => {
    PurchaseOrder.find({}).then(pos => {
      res.render('purchase-orders', {
        purchaseOrders: pos
      });
    });
  });

  app.get('/purchase-order', (req, res) => {
    var id = req.query.id;
    if (id) {
      PurchaseOrder.findOne({_id: id}).populate('delivery').then(po => {
        res.render('purchase-order', {
          po: po
        });
      });
    } else {
      res.render('purchase-order');
    }
  });

  app.get('/labels', (req, res) => {
    var filePath = path.join(__dirname, '../downloads/product-labels.csv');
    res.download(filePath, 'labels.csv');
  });

  app.get('/upload-template', (req, res) => {
    res.download(path.join(__dirname, '../downloads/Product Upload Template.csv'));
  });

  app.get('/tools', (req, res) => {
    res.render('tools');
  });

  app.get('/unpaid-orders', (req, res) => {
    Order.findUnpaidOrders(true).populate('customer').then(canOrders => {
      Order.findUnpaidOrders(false).populate('customer').then(usOrders => {
        res.render('unpaid-orders', {
          canOrders: canOrders,
          usOrders: usOrders
        });
      });
    });
  });

  app.get('/orders/on/:day', (req, res) => {
    var dayStart = moment(req.params.day).startOf('day');
    var dayEnd = moment(req.params.day).endOf('day');
    Order.find({orderDate: {$gte: dayStart, $lte: dayEnd}}).populate('customer').then(orders => {
      res.render('orders', {
        orders: orders
      });
    });
  });

  app.get('/held-orders', (req, res) => {
    Order.find({hold: true, canadian: true}).populate('customer').then(canOrders => {
      Order.find({hold: true, canadian: false}).populate('customer').then(usOrders => {
        res.render('held-orders', {
          usOrders: usOrders,
          canOrders: canOrders
        });
      });
    });
  });

  app.get('/shipping-label', (req, res) => {
    Order.findOne({_id: req.query.id}).then(order => {
      res.render('shipping-label', {
        order: order
      });
    });
  });

  app.get('/transfer', (req, res) => {
    res.render('transfer');
  });

  app.get('/batch-shipping', (req, res) => {
    loadBatch(req.query.id).then(batch => {
      res.render('batch-shipping', {
        batch: batch
      });
    });
  });

  app.get('/item', (req, res) => {
    Item.findOne({_id: req.query.id}).then(item => {
      if (item) {
        item.findOrders().then(orders => {
          res.render('item', {
            item: item,
            orders: orders
          });
        });
      } else {
        res.redirect('database');
      }
    });
  });

  app.get('/customers', (req, res) => {
    Customer.find({}).then(customers => {
      res.render('customers', {
        customers: customers
      });
    });
  });

  app.get('/customer', (req, res) => {
    Customer.findOne({_id: req.query.id}).populate('orders').then(customer => {
      if (customer) {
        customer.getCustomerFrom3DCart();
        customer.getCustomerType().then(customer => {
          res.render('customer', {
            customer: customer
          });
        });
      } else {
        res.redirect('/customers');
      }
    });
  });

  app.get('/customer-cart/:id', (req, res) => {
    Customer.findOne({customerId: req.params.id}).populate('orders').then(customer => {
      customer.getCustomerFrom3DCart();
      res.render('customer', {
        customer: customer
      });
    });
  });

  app.get('/needs-invoicing', (req, res) => {
    Order.findOrdersToBeInvoiced(true).populate('customer').then(canOrders => {
      Order.findOrdersToBeInvoiced(false).populate('customer').then(usOrders => {
        res.render('needs-invoicing', {
          usOrders: usOrders,
          canOrders: canOrders
        });
      });
    });
  });

  app.get('/order-report', (req, res) => {
    var query = {};
    if (req.query.imported && req.query.imported != 'any') {
      query.imported = req.query.imported;
    }
    if (req.query.invoiced && req.query.invoiced != 'any') {
      query.invoiced = req.query.invoiced;
    }
    if (req.query.paid && req.query.paid != 'any') {
      query.paid = req.query.paid;
    }
    if (req.query.picked && req.query.picked != 'any') {
      query.picked = req.query.picked;
    }
    if (req.query.hold && req.query.hold != 'any') {
      query.hold = req.query.hold;
    }
    if (req.query.isBackorder && req.query.isBackorder != 'any') {
      query.isBackorder = req.query.isBackorder;
    }
    if (req.query.from && req.query.to) {
      query.orderDate = {
        '$gte': new Date(req.query.from),
        '$lte': new Date(req.query.to)
      };
    } else if (req.query.from) {
      query.orderDate = {
        '$gte': new Date(req.query.from)
      };
    }
    query.canadian = true;
    Order.find(query).populate('customer').populate('items.item').then(canOrders => {
      query.canadian = false;
      Order.find(query).populate('customer').populate('items.item').then(usOrders => {
        res.render('order-report', {
          canOrders: canOrders,
          usOrders: usOrders
        });
      });
    });
  });

  app.get('/sales-report', (req, res) => {
    var aMonthAgo = moment().subtract(1, 'month');
    Order.find({orderDate: {$gte: aMonthAgo}}).populate('customer').sort('orderDate').then(orders => {
      var retailOrders = orders.filter(order => order.customer.customerType == 0);
      var wholesaleOrders = orders.filter(order => order.customer.customerType != 0);
      res.render('sales-report', {
        retailOrders: retailOrders,
        wholesaleOrders: wholesaleOrders
      });
    });
  });

  function loadBatch(id) {
    return Batch.findOne({_id: id}).populate({
      path: 'orders',
      model: 'Order',
      populate: [{
        path: 'items.item',
        model: 'Item',
        populate: {
          path: 'parent',
          model: 'Item'
        }
      }, {
        path: 'customer',
        model: 'Customer'
      }]
    }).populate('picker');
  }

  function getCustomerType(order) {
    return order.populate('customer').execPopulate().then(() => {
      if (order.customer)
        return order.customer.getCustomerType();
    });
  }
}