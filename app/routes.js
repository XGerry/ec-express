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
var Item = require('./model/item');
var async = require('async');
var crypto = require('crypto');
var queryString = require('query-string');

var ordersFromQuickbooks = {}; // do it this way for now

// application/json parser
var jsonParser = bodyParser.json({limit : '50mb'});

// application/x-www-form-urlencoded
var formParser = bodyParser.urlencoded({limit : '50mb'});

function inventorySyncCallback(response) {
  xmlParser(response, {explicitArray: false}, function(err, result) {
    var itemInventoryRs = result.QBXML.QBXMLMsgsRs.ItemInventoryQueryRs;
    if (itemInventoryRs) {
      itemInventoryRs.ItemInventoryRet.forEach(function(qbItem) {
        Item.findOne({sku: qbItem.FullName}, function(err, item) {
          if (err) {
            console.log('Error finding the item');
          } else {
            if (!item) {
              console.log('Unable to find item ' + qbItem.FullName);
            }
            else {
              if (item.stock != qbItem.QuantityOnHand) {
                item.stock = qbItem.QuantityOnHand
                item.updated = true;
              } else {
                item.updated = false;
              }
              
              if (qbItem.DataExtRet) {
                if (qbItem.DataExtRet instanceof Array) {
                  qbItem.DataExtRet.forEach(function(data) {
                    addItemProperties(data, item);
                  });
                } else {
                  addItemProperties(qbItem.DataExtRet, item);
                }
              }

              item.listId = qbItem.ListID;
              item.editSequence = qbItem.EditSequence;
              if (item.inactive != !qbItem.IsActive) {
                item.inactive = !qbItem.IsActive;
                item.updated = true;
              }
              item.save();
            }
          }
        });
      });
    }
  });
}

function addItemProperties(data, item) {
  if (data.DataExtName == 'barcode') {
    if (item.barcode != data.DataExtValue) {
      item.barcode = data.DataExtValue;
      item.updated = true && !item.isOption;
    }
  } else if (data.DataExtName == 'Location') {
    if (item.location != data.DataExtValue) {
      item.location = data.DataExtValue;
      item.updated = true && !item.isOption;
    }
  } else if (data.DataExtName == 'Country') {
    if (item.countryOfOrigin != data.DataExtValue) {
      item.countryOfOrigin = data.DataExtValue;
      item.updated = true && !item.isOption;
    }
  }
}

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
              if (invoice) { // if there was no invoice then all the orders are new
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

    app.get('/3dcart', function(req, res) {
      res.render('3dcart');
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
        dateend : req.query.endDate,
        invoicenumber : req.query.number
      };

      getOrders(options, qbws, function(responseObject) {
        res.send(responseObject);
      });
    });

    app.get('/api/order/id', function(req, res) {
      var id = res.query.id;
      var options = {
        url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Orders/'+id,
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        }
      };

      // first do a request to see how many products there are
      request.get(options, function(error, response, body) {
        res.send(body);
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

    app.get('/api/feeds/amazon/inventory', function(req, res) {
      var options = {
        url: 'https://mws.amazonservices.com/',
        qs: {
          AWSAccessKeyId: 'AKIAIOKE3I3CIQ7KLTIQ',
          Action: 'SubmitFeed',
          ContentMD5Value: '',
          FeedType: '_POST_INVENTORY_AVAILABILITY_DATA_',
          Merchant: 'A1AG76L8PLY85T',
          PurgeAndReplace: false,
          SignatureMethod: 'HmacSHA256',
          SignatureVersion: '2',
          Timestamp: '',
          Version: '2009-01-01',
        },
        headers: {
          'Content-Type': 'text/xml'
        }
      };

      var xmlDoc = {
        AmazonEnvelope : {
          Header: {
            DocumentVersion: 1.01,
            MerchantIdentifier: 'M_ECSTASYCRA_1118417'
          },
          MessageType: 'Inventory',
          Message: {
            MessageID: '1',
            Inventory: {
              SKU: 'CED14002',
              Quantity: 10
            }
          }
        }
      };

      var body = helpers.getXMLDoc(xmlDoc);
      options.body = body;
      var now = new Date();
      options.qs.Timestamp = now.toISOString();
      options.qs.ContentMD5Value = crypto.createHash('md5').update(body).digest('base64');

      var qString = queryString.stringify(options.qs);
      
      var stringToSign = 'POST\n' + 
        'mws.amazonservices.com\n' +
        '/\n' +
        qString;

      options.qs.Signature = crypto.createHmac('sha256', '2bHczom1cYmxClNSiBbqxkCM7gnHnMPiyBu6S+qP')
        .update(stringToSign)
        .digest('base64');

      request.post(options, function(err, response, body) {
        console.log(err);
        res.send(body);
      });
    });

    app.get('/api/feeds/amazon/price', function(req, res) {
      var options = {
        url: 'https://mws.amazonservices.com/',
        qs: {
          AWSAccessKeyId: 'AKIAIOKE3I3CIQ7KLTIQ',
          Action: 'SubmitFeed',
          ContentMD5Value: '',
          FeedType: '_POST_PRODUCT_PRICING_DATA_',
          Merchant: 'A1AG76L8PLY85T',
          PurgeAndReplace: false,
          SignatureMethod: 'HmacSHA256',
          SignatureVersion: '2',
          Timestamp: '',
          Version: '2009-01-01',
        },
        headers: {
          'Content-Type': 'text/xml'
        }
      };

      var xmlDoc = {
        AmazonEnvelope : {
          Header: {
            DocumentVersion: 1.01,
            MerchantIdentifier: 'M_ECSTASYCRA_1118417'
          },
          MessageType: 'Price',
          Message: {
            MessageID: '1',
            Price: {
              SKU: 'CED14002',
              StandardPrice: {
                '@currency': 'USD',
                '#text': '26.50',
              }
            }
          }
        }
      };

      var body = helpers.getXMLDoc(xmlDoc);
      options.body = body;
      var now = new Date();
      options.qs.Timestamp = now.toISOString();
      options.qs.ContentMD5Value = crypto.createHash('md5').update(body).digest('base64');

      var qString = queryString.stringify(options.qs);
      
      var stringToSign = 'POST\n' + 
        'mws.amazonservices.com\n' +
        '/\n' +
        qString;

      options.qs.Signature = crypto.createHmac('sha256', '2bHczom1cYmxClNSiBbqxkCM7gnHnMPiyBu6S+qP')
        .update(stringToSign)
        .digest('base64');

      request.post(options, function(err, response, body) {
        console.log(err);
        res.send(body);
      });
    });

    app.get('/api/feeds/amazon/data', function(req, res) {
      var options = {
        url: 'https://mws.amazonservices.com/',
        qs: {
          AWSAccessKeyId: 'AKIAIOKE3I3CIQ7KLTIQ',
          Action: 'SubmitFeed',
          ContentMD5Value: '',
          FeedType: '_POST_PRODUCT_DATA_',
          Merchant: 'A1AG76L8PLY85T',
          PurgeAndReplace: false,
          SignatureMethod: 'HmacSHA256',
          SignatureVersion: '2',
          Timestamp: '',
          Version: '2009-01-01',
        },
        headers: {
          'Content-Type': 'text/xml'
        }
      };

      var xmlDoc = {
        AmazonEnvelope : {
          Header: {
            DocumentVersion: 1.01,
            MerchantIdentifier: 'M_ECSTASYCRA_1118417'
          },
          MessageType: 'Product',
          PurgeAndReplace: 'false',
          Message: {
            MessageID: '1',
            Product: {
              SKU: 'CED14003',
              StandardProductID: {
                Type: 'UPC',
                Value: '5055305927717'
              }
            }
          }
        }
      };

      var body = helpers.getXMLDoc(xmlDoc);
      options.body = body;
      var now = new Date();
      options.qs.Timestamp = now.toISOString();
      options.qs.ContentMD5Value = crypto.createHash('md5').update(body).digest('base64');

      var qString = queryString.stringify(options.qs);
      
      var stringToSign = 'POST\n' + 
        'mws.amazonservices.com\n' +
        '/\n' +
        qString;

      options.qs.Signature = crypto.createHmac('sha256', '2bHczom1cYmxClNSiBbqxkCM7gnHnMPiyBu6S+qP')
        .update(stringToSign)
        .digest('base64');

      request.post(options, function(err, response, body) {
        console.log(err);
        res.send(body);
      });
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
      // get the product list from 3D Cart first
      var options = {
        url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/skuinfo',
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        },
        qs: {
          countonly: 1
        }
      }

      request(options, function(err, response, body) {
        console.log(body);
        var responseObject = JSON.parse(body);
        var totalItems = responseObject.TotalCount;

        var numOfRequests = Math.ceil(totalItems / 200);
        console.log('We need to send '+numOfRequests+' requests to get all the items.');
        var requests = [];

        for (var i = 0; i < numOfRequests; i++) {
          options.qs.countonly = 0;
          options.qs.offset = i * 200;
          options.qs.limit = 200;
          requests.push(JSON.parse(JSON.stringify(options)));
        }
        var counter = 0;
        async.mapSeries(requests, function(option, callback) {
          request(option, function(err, response, body) {
            if (err) {
              callback(err);
            } else {
              callback(null, JSON.parse(body));
            }
            counter++;
            console.log(((counter / numOfRequests) * 100).toFixed(0));
          });
        }, function(err, responses) {
          var merged = [].concat.apply([], responses);
          var qbRq = {
            ItemInventoryQueryRq: {
              '@requestID' : 'inventoryRq',
              FullName: []
            }
          };

          merged.forEach(function(skuInfo) {
            var sku = skuInfo.SKU.trim();
            Item.findOne({sku: sku}, function(err, item) {
              if (err) {
                console.log('error!');
              } else {
                if (item) {
                  item.name = skuInfo.Name;
                  item.stock = skuInfo.Stock;
                  item.usPrice = skuInfo.Price;
                  item.updated = false;
                  item.catalogId = skuInfo.CatalogID;
                  item.isOption = false;
                  item.save();
                } else {
                  var newItem = new Item();
                  newItem.sku = sku;
                  newItem.name = skuInfo.Name;
                  newItem.stock = skuInfo.Stock;
                  newItem.usPrice = skuInfo.Price;
                  newItem.updated = false;
                  newItem.catalogId = skuInfo.CatalogID;
                  newItem.isOption = false;
                  newItem.save();
                }
              }
            });

            // build a qbxml
            qbRq.ItemInventoryQueryRq.FullName.push(sku);
          });

          qbRq.ItemInventoryQueryRq.OwnerID = 0;
          var xmlDoc = helpers.getXMLRequest(qbRq);
          var str = xmlDoc.end({pretty:true});
          qbws.addRequest(str);
          qbws.setCallback(inventorySyncCallback);
          res.send(merged);
        });
      });
    });

    /**
     * This function doesn't do the request to 3D cart and just takes the last
     * information about items to convert to a QBXML
     */
    app.get('/api/sync/inventory/qbxml', function(req, res) {
      var qbRq = {
        ItemInventoryQueryRq: {
          '@requestID' : 'inventoryRq',
          FullName: []
        }
      };

      Item.find({}, function(err, items) {
        if (err) {
          console.log('An error occurred finding the items in Mongo.');
        } else {
          console.log('Found ' + items.length + ' items in the database.');
          items.forEach(function(item) {
            qbRq.ItemInventoryQueryRq.FullName.push(item.sku);
          });
        }
      });

      qbRq.ItemInventoryQueryRq.OwnerID = 0;
      var xmlDoc = helpers.getXMLRequest(qbRq);
      var str = xmlDoc.end({pretty:true});
      qbws.addRequest(str);

      qbws.setCallback(inventorySyncCallback);
      res.send('Run the Web Connector.');
    });

    app.get('/api/test/sync', function(req, res) {
      var id = req.query.id;

      var options = {
        url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
        method: 'PUT',
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        },
        body: body,
        json: true
      };

      request(options, function(err, response, body) {
        res.send(response);
      });
    });

    /**
     * This route will find and record all items that have options.
     * Then we know what options to query and save.
     */
    app.get('/api/find/options', function(req, res) {
      // get the product list from 3D Cart first
      var options = {
        url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        },
        qs: {
          countonly: 1
        }
      }

      request(options, function(err, response, body) {
        var responseObject = JSON.parse(body);
        var totalItems = responseObject.TotalCount;

        var numOfRequests = Math.ceil(totalItems / 200);
        console.log('We need to send '+numOfRequests+' requests to get all the items.');
        var requests = [];

        for (var i = 0; i < numOfRequests; i++) {
          options.qs.countonly = 0;
          options.qs.offset = i * 200;
          options.qs.limit = 200;
          requests.push(JSON.parse(JSON.stringify(options)));
        }
        var counter = 0;
        async.mapSeries(requests, function(option, callback) {
          request(option, function(err, response, body) {
            if (err) {
              callback(err);
            } else {
              callback(null, JSON.parse(body));
            }
            counter++;
            console.log((counter / numOfRequests) * 100);
          });
        }, function(err, responses) {
          var merged = [].concat.apply([], responses);

          var optionedItems = [];

          merged.forEach(function(skuInfo) {
            var sku = skuInfo.SKUInfo.SKU.trim();

            Item.findOne({sku: sku}, function(err, item) {
              if (err) {
                console.log('Error finding the item.');
              } else {
                if (item) {
                  if (skuInfo.OptionSetList.length > 0) {
                    item.hasOptions = true;
                    item.save();
                    optionedItems.push(item);
                    console.log('found option');
                  } else {
                    item.hasOptions = false;
                    item.save();
                  }
                }
              }
            });
          });

          res.send(optionedItems);
        });
      });
    });

    /**
     * This route gets the advaced options for all items that have options and then
     * saves their options as items
     */
    app.get('/api/items/advancedoptions', function(req, res) {
      Item.find({hasOptions: true}, function(err, items) {
        if (err) {
          console.log('Error getting the items.');
        } else {
          var requests = [];
          console.log(items.length + ' items have options.');

          for (var i = 0; i < items.length; i++) {
            var options = {
              url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+items[i].catalogId+'/AdvancedOptions',
              headers : {
                SecureUrl : 'https://www.ecstasycrafts.com',
                PrivateKey : process.env.CART_PRIVATE_KEY,
                Token : process.env.CART_TOKEN
              },
              itemId: items[i].catalogId
            };
            requests.push(JSON.parse(JSON.stringify(options)));
          }

          var counter = 0;
          console.log('Starting the mapping');

          async.mapLimit(requests, 3, function(option, callback) {
            function doRequest() {
              var itemId = option.itemId;
              request(option, function(err, response, body) {
                if (err) {
                  callback(err);
                } else {
                  console.log(counter++);
                  if (body) {
                    var modified = JSON.parse(body);
                    modified.forEach(function(optionItem) {
                      optionItem.itemId = itemId;
                    });
                    callback(null, modified);
                  } else {
                    callback(body);
                  }
                }
              });
            }
            setTimeout(doRequest, 1000);
          }, function(err, responses) {
            console.log('done');
            console.log(err);
            var merged = [].concat.apply([], responses);
            var toSend = [];

            merged.forEach(function(optionItem) {
              if (optionItem && optionItem.AdvancedOptionSufix != "" && optionItem.AdvancedOptionSufix != undefined) {
                Item.findOne({sku: optionItem.AdvancedOptionSufix}, function(err, item) {
                  if (err) {
                    console.log(err);
                  } else {
                    if (item) {
                      item.name = optionItem.AdvancedOptionName;
                      item.isOption = true;
                      item.usPrice = optionItem.AdvancedOptionPrice;
                      item.stock = optionItem.AdvancedOptionStock;
                      item.optionId = optionItem.AdvancedOptionCode;
                      item.catalogId = optionItem.itemId;
                      item.save();
                    } else {
                      var newItem = new Item();
                      newItem.sku = optionItem.AdvancedOptionSufix;
                      newItem.name = optionItem.AdvancedOptionName;
                      newItem.isOption = true;
                      newItem.usPrice = optionItem.AdvancedOptionPrice;
                      newItem.stock = optionItem.AdvancedOptionStock;
                      newItem.optionId = optionItem.AdvancedOptionCode;
                      newItem.catalogId = optionItem.itemId;
                      newItem.save();
                    }
                  }
                });
                toSend.push(optionItem);
              }
            });
            res.send(toSend);
          });
        }
      });
    });

    app.post('/api/sync/inventory', function(req, res) {
      // send the items back to 3D Cart
      Item.find({updated: true, isOption: false}, function(err, items) {
        console.log('There are ' + items.length + ' items that need inventory synced.');
        var body = [];
        var numOfRequests = Math.ceil(items.length / 100); // can only update 100 items at a time
        console.log('We need to send ' + numOfRequests + ' requests.');
        items.forEach(function(item) {
          var cartItem = {
            SKUInfo: {
              SKU: item.sku,
              Stock: item.stock,
              CatalogID: item.catalogId
            },
            MFGID: item.sku,
            WarehouseLocation: item.location,
            ExtraField8: item.barcode,
            ExtraField9: item.countryOfOrigin
          };

          if (item.inactive) {
            cartItem.SKUInfo.Stock = 0;
          }

          if (item.hasOptions) {
            cartItem.SKUInfo.Stock = 100;
          }

          body.push(cartItem);
        });

        var options = {
          url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
          method: 'PUT',
          headers : {
            SecureUrl : 'https://www.ecstasycrafts.com',
            PrivateKey : process.env.CART_PRIVATE_KEY,
            Token : process.env.CART_TOKEN
          },
          body : body,
          json : true
        };

        var requests = [];
        for (var i = 0; i < numOfRequests; i++) {
          options.body = body.slice(i*100, (i+1)*100);
          requests.push(JSON.parse(JSON.stringify(options)));
        }

        var counter = 0;
        async.mapSeries(requests, function(option, callback) {
          request(option, function(err, response, body) {
            if (err) {
              callback(err);
            } else {
              callback(null, body);
              counter++;
              console.log(((counter / numOfRequests) * 100).toFixed(0));
            }
          });
        }, function(err, responses) {
          var merged = [].concat.apply([], responses);
          res.send(merged);
        });
      });
    });

    app.post('/api/sync/inventory/options', function(req, res) {
      Item.find({isOption: true, updated: true, inactive: false}, function(err, items) {
        if (err) {
          console.log(err);
        } else {
          console.log('There are ' + items.length + ' options that need updating.');
          
          var requests = [];

          var options = {
            url: '',
            method: 'PUT',
            headers : {
              SecureUrl : 'https://www.ecstasycrafts.com',
              PrivateKey : process.env.CART_PRIVATE_KEY,
              Token : process.env.CART_TOKEN
            },
            json: true
          };

          items.forEach(function(item) {
            options.body = {
              AdvancedOptionStock: item.stock
            }
            var url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+
              item.catalogId+'/AdvancedOptions/'+item.optionId;
            options.url = url;
            requests.push(JSON.parse(JSON.stringify(options)));
          });

          async.mapLimit(requests, 2, function(option, callback) {
            function doRequest() {
              request(option, function(err, response, body) {
                if (err) {
                  callback(err);
                } else {
                  console.log(body);
                  callback(null, body);
                }
              });
            }

            setTimeout(doRequest, 1000);
          }, function(err, responses) {
            var merged = [].concat.apply([], responses);
            res.send(merged);
          });
        }
      });
    });

    app.post('/api/3dcart/inventory', formParser, function(req, res) {
      var products = req.body.products;
      var options = {
        url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
        method: 'PUT',
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        },
        body : req.body.products,
        json : true
      };

      request(options, function(err, response, body) {
        res.send(body);
      });
    });

    /**
     * This route creates a QBxml based on the mongo state of our items
     * to update the inventory in quickbooks.
     */
    app.get('/api/qb/inventory', function(req, res) {
      Item.find({}, function(err, items) {
        if (err) {
          console.log('error finding the items.');
        } else {
          items.forEach(function(item) {
            var itemMod = {
              ListID: item.listId,
              EditSequence: item.editSequence,
              SalesPrice: item.usPrice
            }

            var modRequest = helpers.modifyItemRq(itemMod);
            qbws.addRequest(modRequest);
          });  

          res.send('Run the Web Connector.');        
        }
      });
    });

    app.get('/api/3dcart/inventory', function(req, res) {
      var sku = req.query.sku;
      var category = req.query.category;
      var qbxml = req.query.qbxml;
      var csv = req.query.csv;
      var options = {
        url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        },
        qs : {
          limit: 500
        }
      };

      if (sku) {
        options.qs.sku = sku;
      }

      if (category) {
        options.url = "https://apirest.3dcart.com/3dCartWebAPI/v1/Categories/" + category + "/Products";
      }

      request.get(options, function(err, response, body) {
        if (!body) {
          res.send('No products found');
          return;
        }
        var products = JSON.parse(body);
        var getItemsRq = helpers.queryItemRq(products);
        if (qbxml) {
          qbws.addRequest(getItemsRq);
          qbws.setCallback(function(response) {
            xmlParser(response, {explicitArray: false}, function(err, result) {
              var itemInventoryRs = result.QBXML.QBXMLMsgsRs.ItemInventoryQueryRs;
              if (itemInventoryRs) {
                itemInventoryRs.ItemInventoryRet.forEach(function(item) {
                  var itemMod = {
                    ListID: item.ListID,
                    EditSequence: item.EditSequence,
                    SalesPrice: item.SalesPrice
                  };

                  for (var i = 0; i < products.length; i++) {
                    if (products[i].SKUInfo.SKU == item.FullName) {
                      itemMod.SalesPrice = products[i].SKUInfo.Price
                    }
                  }

                  var modRequest = helpers.modifyItemRq(itemMod);
                  qbws.addRequest(modRequest);
                });
              }
            });
          });
        }
        
        if (csv) {
          var doc = '';
          var headers = 'id, name, categories, mfgid, manufacturer, price, price2, price3, price4, stock, weight, image1, hide, keywords'
          products.forEach(function(product) {
            doc+=''
          });
        }
        res.send(products);
      });
    });

    app.get('/inventory', function(req, res) {
      res.render('inventory');
    });

    app.get('/', function(req, res) {
      res.render('home');
    });

    app.get('/api/3dcart/category', function(req, res) {
      // for now, all this does is sets the category sorting level
      var sort = req.query.sort;
      var id = req.query.id;

      var options = {
        url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Categories',
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        },
        qs: {
          limit: 500,
          offset: 0
        }
      }

      if (id !== undefined) {
        options.url += '/' + id;
      }

      request.get(options, function(err, response, body) {
        if (err) {
          console.log(err);
          console.log(response);
          console.log('error');
          res.send(err);
        } else {
          // body should contain all the categories in an array
          console.log('success');
          
          var cats = JSON.parse(body);
          console.log(cats.length);
          res.send(cats);
          if (sort) {
            cats.forEach(function(category) {
            category.DefaultProductsSorting = 4;
            console.log(category.CategoryName);
            });

            options.method = 'PUT';
            options.body = cats;
            options.json = true;

            request(options, function(err, response, body) {
              console.log(body);
            });
          }
        }
      });
    });
  }
}