var helpers = require('./helpers.js');
var xmlParser = require('xml2js').parseString; 
var request = require('request');
var pixl = require('pixl-xml')
var path = require('path');
var fs = require('fs');
var bodyParser = require('body-parser');
var mws = require('mws-nodejs');
var config = require('../config/mws.json');
var Order = require('./model/order');
var Report = require('./model/report');
var Settings = require('./model/settings');
var async = require('async');

var ordersFromQuickbooks = {}; // do it this way for now

// application/json parser
var jsonParser = bodyParser.json({limit : '50mb'});

// application/x-www-form-urlencoded
var formParser = bodyParser.urlencoded({limit : '50mb'});

function getOrders(options, qbws, callback) {
  // clear the requests in qbws
  qbws.clearRequests();
  // clear our database of all requests
  Order.remove({}, function (err) {
      if (err) {
          console.log('error removing the orders');
      } else {
          console.log('removed the orders');
      }
  });

  // set a new timecode
  helpers.timecode = + new Date();

  var options = {
    url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Orders',
    headers : {
      SecureUrl : 'https://www.ecstasycrafts.com',
      PrivateKey : process.env.CART_PRIVATE_KEY,
      Token : process.env.CART_TOKEN
    },
    qs : options
  }

  request.get(options, function (error, response, body) {
    var responseObject = {};
    var contacts = [];

    if (body == '') {
      responseObject.success = true;
      responseObject.message = 'No orders found';
      responseObject.response = [];
      callback(responseObject);
      return;
    }

    if (error) {
      responseObject.success = false;
      responseObject.message = error;
    } else {
      var jsonBody = JSON.parse(body);
      responseObject.success = true;
      responseObject.message = 'Received ' + jsonBody.length + ' orders from 3D Cart.';
      responseObject.response = jsonBody;

      // first request is a check to see if there are duplicate invoices
      var invoiceRq = helpers.queryInvoiceRq(jsonBody);
      qbws.addRequest(invoiceRq);
      qbws.setCallback(function(response) {
        var doc = pixl.parse(response);
        var invoiceRs = doc.QBXMLMsgsRs.InvoiceQueryRs;
        if (invoiceRs) {
          if (invoiceRs.requestID == 'invoiceCheck') {
            var orders = qbws.getOrders();
            if (invoiceRs.InvoiceRet instanceof Array) {
              console.log(invoiceRs.InvoiceRet.length + ' duplicates found.');
              invoiceRs.InvoiceRet.forEach(function(invoice) {
                var index = -1;
                for (var i = 0; i < orders.length; i++) {
                  var order = orders[i];
                  var orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;
                  if (invoice.RefNumber == orderId) {
                    index = i;
                    break;
                  }
                }
                // remove the order from the import list
                qbws.removeOrder(index);
                Order.findOne({orderId: invoice.RefNumber}, function(err, savedOrder) {
                  savedOrder.errorMessage = 'Duplicate order. Skipping import.';
                  savedOrder.save();
                });
              });
            } else {
              console.log('not an array');
              var invoice = invoiceRs.InvoiceRet;
              var index = -1;
              for (var i = 0; i < orders.length; i++) {
                var order = orders[i];
                var orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;
                if (invoice.RefNumber == orderId) {
                  index = i;
                  break;
                }
              }
              qbws.removeOrder(index);
              Order.findOne({orderId: invoice.RefNumber}, function(err, savedOrder) {
                savedOrder.errorMessage = 'Duplicate order. Skipping import.';
                savedOrder.save();
              });
            }
            // now all the orders should only contain the ones we want to import
            qbws.generateOrderRequest();
          }
        }
      });

      // build requests and save this to the database
      jsonBody.forEach(function (order) {
        console.log('adding order to quickbooks');
        qbws.addOrder(order);

        contacts.push(helpers.getCustomer(order)); // hubspot integration
        // create the order in our database
        var newOrder = new Order();
        newOrder.cartOrder = order;
        newOrder.name = order.BillingFirstName + ' ' + order.BillingLastName;
        newOrder.orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;
        newOrder.imported = false;
        newOrder.save(function(err) {
          if (err) {
            console.log('error saving the order');
          } else {
            console.log('order was saved successfully');
          }
        });
      });

      helpers.updateContacts(contacts, function(message) {
        console.log(message);
        responseObject.hubspot = message;
      });
      
      callback(responseObject); // moved this out of hubspot because it was taking way too long
    }
  });
}

module.exports = {
  getOrders : getOrders,
  route : function(app, passport, qbws) {
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
      res.render('customs');
    });

    app.get('/user', function(req, res) {
      return res.send(req.user);
    });

    app.post('/contact', formParser, function(req, res) {
      if (!req.body) {
        return res.sendStatus(400);
      }

      console.log('Creating a new contact to send to Hubspot.');
      console.log(req.body);
      console.log('Firstname: ' + req.body.firstname);
      console.log('Lastname: ' + req.body.lastname);
      console.log('Email: ' + req.body.email);

      var options = {
        url : 'https://forms.hubspot.com/uploads/form/v2/2759836/26c3d878-3647-43ff-a3b7-642b59245fa1',
        form : contact
      };

      request.post(options, function(error, response) {
        if (error) {
          console.log(error);
          console.log(response);
        }
        res.send('Created contact in Hubspot');
      });
    });

    app.post('/api/orders', jsonParser, authenticate, function (req, res) {
      console.log('Updating ' + req.body.length + ' orders in 3D Cart.');
      helpers.updateOrders(req.body, function(err, response, body) {
        res.send(response);
      });
    });

    app.get('/api/orders', authenticate, function (req, res) {
      var options = {
        limit : req.query.limit != '' ? req.query.limit : 200,
        orderstatus : req.query.status, // Status of New = 1
        datestart : req.query.startDate,
        dateend : req.query.endDate
      };

      getOrders(options, qbws, function(responseObject) {
        res.send(responseObject);
      });
    });

    app.get('/api/invoices', authenticate, function (req, res) {

      if (!req.query.startDate || !req.query.endDate) {
        res.send('Error. You must supply a start and an end date.');
        return;
      }

      var name = req.query.name;

      if (!name) {
        name = 'default';
      }

      var invoiceQuery = {
        InvoiceQueryRq : {
          '@requestID' : 'manifest',
          TxnDateRangeFilter : {
            FromTxnDate : req.query.startDate,
            ToTxnDate : req.query.endDate
          },
          IncludeLineItems : true,
          OwnerID : 0
        }
      };

      var request = helpers.getXMLRequest(invoiceQuery);
      var str = request.end({'pretty': true});
      qbws.addRequest(str);
      qbws.setCallback(function (response) {
        xmlParser(response, {explicitArray: false}, function(err, result) {
          if (err) {
            console.log('There was an error parsing the response.');
          }
          ordersFromQuickbooks = result;
          var invoiceQueryRs = result.QBXML.QBXMLMsgsRs.InvoiceQueryRs;
          if (invoiceQueryRs) {
            Report.findOne({name : name}, function (err, doc) {
              if (doc) {
                doc.invoices = invoiceQueryRs.InvoiceRet;
                doc.save();
              } else {
                var newReport = new Report();
                newReport.name = name;
                newReport.invoices = invoiceQueryRs.InvoiceRet;
                newReport.save();
              }
            });
          }
        });
      });

      res.send('Run the Web Connector to generate the invoices on the server.');
    });

    // Pass in the name of the report you want to build the manifest for
    app.get('/api/generate/manifest', function (req, res) {
      var name = req.query.name;
      if (!name) {
        name = 'default';
      }

      var manifest = '';
      var now = new Date();
      manifest += now.toISOString() + '\n\n';
      var headers = 'HTC Code, Country Of Origin, Quantity, Value';

      Report.findOne({name: name}, function(err, doc) {
        if (err) {
          res.send('Error generating the request.');
        }

        // Now we generate the manifest
        doc.invoices.forEach(function(invoice) {
          // gather the info we need
          var isCanadian = helpers.isCanadian(invoice.ShipAddress);

          if (!isCanadian) {
            var address = invoice.ShipAddress;
            var addr1 = helpers.safePrint(address.Addr1);
            var addr2 = helpers.safePrint(address.Addr2);
            var addr3 = helpers.safePrint(address.Addr3);
            var city = address.City;
            var state = address.State;
            var postalCode = address.PostalCode;
            var totalAmount, totalQuantity = 0;

            var itemArray = [];

            if (invoice.InvoiceLineRet instanceof Array) {
              invoice.InvoiceLineRet.forEach(function(lineItem) {
                helpers.addItemForManifest(lineItem, doc, itemArray);
              });
            } else {
              helpers.addItemForManifest(invoice.InvoiceLineRet, doc, itemArray);
            }

            manifest += invoice.RefNumber + '\n';
            manifest += '"'+addr1+'\n'+addr2+'\n'+addr3+'"\n"'+city+', '+state+', '+postalCode+'"\n';
            manifest += headers+'\n';

            var htcMap = {};
            itemArray.forEach(function(item) {
              if (!htcMap.hasOwnProperty(item.htcCode)) {
                htcMap[item.htcCode] = {};
              }

              htcObj = htcMap[item.htcCode];

              if (!htcObj.hasOwnProperty(item.countryOfOrigin)) {
                htcObj[item.countryOfOrigin] = {
                  value : 0,
                  quantity : 0
                };
              }
              cooObj = htcObj[item.countryOfOrigin];

              cooObj.quantity += +item.quantity;
              cooObj.value += +item.amount;
            });

            totalAmount = 0;

            for (var htc in htcMap) {
              if (htcMap.hasOwnProperty(htc)) {
                for (var coo in htcMap[htc]) {
                  if (htcMap[htc].hasOwnProperty(coo)) {
                    var line = '';
                    var quantity = +htcMap[htc][coo].quantity;
                    var value = +htcMap[htc][coo].value;
                    line += htc + ',' + coo + ',' + quantity + ',' + value + '\n';
                    totalQuantity += +quantity;
                    totalAmount += +value;
                    manifest += line;
                  }
                }
              }
            }

            manifest += 'Total,,' + totalQuantity + ',' + totalAmount;
            manifest += '\n';
          }
        });

        fs.writeFile('manifest.csv', manifest, function (err) {
          if (err) {
            res.send('Error creating the file.');
            console.log(err);
          } else {
            res.send(manifest);
          }

        });
      });
    });

    // Gets the items from quickbooks based on the invoices (or not) and saves them to a report
    app.get('/api/items', function(req, res) {
      // req should pass in a name
      var name = req.query.name;

      if (!name) {
        name = 'default';
      }

      Report.findOne({name: name}, function(err, doc) {
        if (!doc) {
          res.send('No invoices found. Make sure you run the Web Connector.');
          return;
        }
        var items = [];
        doc.invoices.forEach(function(invoice) {
          items = items.concat(invoice.InvoiceLineRet);
        });

        var str = helpers.queryItemRq(items);
        qbws.addRequest(str);

        qbws.setCallback(function(response) {
          xmlParser(response, {explicitArray: false}, function(err, result) {
            var itemInventoryRs = result.QBXML.QBXMLMsgsRs.ItemInventoryQueryRs;
            if (itemInventoryRs) {
              doc.items = itemInventoryRs.ItemInventoryRet;
              doc.save();
            }
          });
        });

        res.send(doc.invoices);
      });
    });

    // middleware
    function authenticate(req, res, next) {
      if (req.isAuthenticated()) {
        return next();
      }
      console.log('not logged in.');
      res.status(401).send('Please login before trying to perform this request.');
    }

    app.get('/api/amazon', function(req, res) {
      
    });

    app.get('/api/orders/errors', function(req, res) {
      Order.find({ imported: false }, function(err, errors) {
        Order.find({ imported: true }, function(err, successes) {
          if (err) {
            console.log('There was an error finding the orders.');
            res.send('Error getting the results from the last import.');
            return;
          }

          var message = successes.length + ' invoices imported. ' + errors.length + ' errors.'
          console.log(message);

          var responseObject = {
            errors : [],
            successes : []
          };

          errors.forEach(function(doc) {
            doc.cartOrder.errorMessage = doc.errorMessage;
            responseObject.errors.push(doc.cartOrder);
          });

          successes.forEach(function(doc) {
            responseObject.successes.push(doc.cartOrder);
          });

          res.send(responseObject);
        });
      });
    });

    app.get('/api/orders/updateCompleted', function(req, res) {
      helpers.markCompletedOrdersAsProcessing(function(error, response, body) {
        console.log('Marked orders as processing.');
        console.log(response);
        console.log(body);
        res.send(body);
      });
    });

    app.get('/api/feeds/facebook', function(req, res) {

    });

    app.get('/api/generate/feed', function(req, res) {
      var products = [];

      // get the products from 3d cart
      var options = {
        url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/skuinfo',
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        },
        qs : {
          //limit : 200, // max items
          offset : 0,
          countonly : 1
        }
      }

      // first do a request to see how many products there are
      request.get(options, function(error, response, body) {
        var count = JSON.parse(body).TotalCount;
        var numOfRequests = (count / 200) + 1;
        options.qs.limit = 200;
        options.qs.countonly = 0;

        for (var i = 0; i < numOfRequests; i++) {
          request.get(options, function(error1, response1, body1) {
            options.qs.offset += 200;
            var productArray = JSON.parse(body1);
          });
        }
      })

      request.get(options, function(error, response, body) {
        var productArray = JSON.parse(body);
        console.log(productArray);

        if (productArray.length == 1 && productArray[0].Key == "Error") {
          productsRemain = false;
        } else {
          productArray.forEach(function(product) {
            res.write(product);
          });
          products = products.concat(productArray);
        }
      });

      res.end();
    });

    app.get('/api/settings', authenticate, function(req, res) {
      Settings.findOne({account : req.user}, function(err, doc) {
        if (doc) {
          res.send(doc);
        } else {
          var newSettings = new Settings();
          newSettings.companyFile = '';
          newSettings.save();
          res.send(newSettings);
        }
      });
    });

    app.post('/api/settings', authenticate, formParser, function(req, res) {
      Settings.findOne({account : req.user}, function(err, doc) {
        if (err) {
          res.send(false);
        }
        if (doc) {
          doc.companyFile = req.body.companyFile;
          doc.save();
          qbws.companyFile = req.body.companyFile;
          res.send(true);
        } else {
          var newSettings = new Settings();
          newSettings.companyFile = req.body.companyFile;
          newSettings.save();
          qbws.companyFile = newSettings.companyFile;
          res.send(true);
        }
      });
    });

    app.get('/api/inventory', function(req, res) {
      var reportName = req.query.reportName;
      if (!reportName) {
        reportName = 'default'
      }

      qbws.addRequest(helpers.queryItemRq());
      qbws.setCallback(function(message) {
        xmlParser(message, {explicitArray: false}, function(err, result) {
          var itemInventoryRs = result.QBXML.QBXMLMsgsRs.ItemInventoryQueryRs;
          if (itemInventoryRs) {
            Report.findOne({name: reportName}, function(err, doc) {
              console.log(itemInventoryRs.ItemInventoryRet);
              if (doc) {
                doc.inventory = itemInventoryRs.ItemInventoryRet;
                doc.save(function (err, updatedReport) {
                  if (err) {
                    console.log('Error saving report.');
                    console.log(err);
                  }
                  console.log(updatedReport);
                });
              } else {
                var newReport = new Report();
                newReport.name = reportName;
                newReport.inventory = itemInventoryRs.ItemInventoryRet;
                newReport.save();
              }
            });
          }
        });
      });

      res.send('Inventory Query saved. Please run the Web Connector.');
    });

    app.get('/api/sync/inventory', function(req, res) {
      var reportName = req.query.reportName;
      if (!reportName)
        reportName = 'default';

      Report.findOne({name: reportName}, function(err, report) {
        if (err) {
          res.send('Error getting report.');
        }

        if (!report) {
          res.send('The report doesn\'t exist yet. Please generate a query for the items and run the Web Connector.');
        }

        if (!(report.inventory.constructor === Array)) {
          report.inventory = [report.inventory];
        }

        var maxItems = 100; // maximum number of items allowed to update

        var numOfRequests = Math.ceil(report.inventory.length/maxItems);
        console.log('Need to do ' + numOfRequests + ' requests.');
        var bodies = [];

        for (var i = 0; i < numOfRequests; i++) {
          var products = [];
          for (var j = 0; j < maxItems; j++) {
            var index = i*maxItems + j;
            var qbItem = report.inventory[index];
            if (qbItem) {
              var product = {
                mfgid: qbItem.FullName,
                SKUInfo: {
                  SKU : qbItem.FullName,
                  Stock: qbItem.QuantityOnHand
                }
              }
              products.push(product);
            }
          }
          bodies.push(products);
        }

        async.map(bodies, function(body, callback) {
          var options = {
            url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
            method : 'PUT',
            headers : {
              SecureUrl : 'https://www.ecstasycrafts.com',
              PrivateKey : process.env.CART_PRIVATE_KEY,
              Token : process.env.CART_TOKEN
            },
            body : body,
            json : true
          }
          console.log('sending request.');
          request(options, callback);
        }, function(err, response, body) {
          res.send(response);
        });        
      });
    });

    app.get('/api/3dcart/inventory', function(req, res) {
      var options = {
        url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        },
        qs : {
          sku : 'APA12'
        }
      };

      request.get(options, function(err, response, body) {
        res.send(body);
      });
    });
  }
}