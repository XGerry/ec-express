var helpers = require('./helpers.js');
var xmlParser = require('xml2js').parseString; 
var request = require('request');
var path = require('path');
var bodyParser = require('body-parser');
var mws = require('mws-nodejs');
var config = require('../config/mws.json');
var Order = require('./model/order.js');

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
    })

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

      // build requests and save this to the database
      requestNumber = 0;
      jsonBody.forEach(function (order) {
        qbws.addRequest(helpers.addCustomerRq(order, requestNumber++));
        var invoiceRqId = requestNumber++;
        var xmlInvoiceRequest = helpers.addInvoiceRq(order, invoiceRqId);
        qbws.addRequest(xmlInvoiceRequest); // we have to do this because SOAP runs synchronously
        contacts.push(helpers.getCustomer(order)); // hubspot integration

        // create the order in our database
        var newOrder = new Order();
        newOrder.cartOrder = order;
        newOrder.name = order.BillingFirstName + ' ' + order.BillingLastName;
        newOrder.orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;
        newOrder.requestId = invoiceRqId;
        newOrder.imported = false;
        newOrder.qbRequest = xmlInvoiceRequest;
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
            return res.send({
              success : true,
              redirect : '/'
            });
          });
        }
      })(req, res, next);
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
      console.log('Sending a query to QBWC');
      var invoiceQuery = {
        InvoiceQueryRq : {
          '@requestID' : '1',
          MaxReturned : '2',
          TxnDateRangeFilter : {
            FromTxnDate : '2017-03-01',
            ToTxnDate : '2017-03-10'
          },
          IncludeLineItems : true
        }
      };

      var request = helpers.getXMLRequest(invoiceQuery);
      qbws.addRequest(request);
      qbws.setCallback(function (response) {
        console.log('received response');

        xmlParser(response, {explicitArray: false}, function(err, result) {
          ordersFromQuickbooks = result;
          res.send('Now run the QBWC on your machine.');
        });
      });

    });

    app.get('/api/buildManifest', authenticate, function (req, res) {
      var responseObject = {
        response : '',
        success : false,
        message : ''
      };

      if (!ordersFromQuickbooks) {
        responseObject.success = false;
        responseObject.response = '';
        responseObject.message = 'Error getting the orders from QuickBooks. Make sure you run the WebConnector.';
        res.send(responseObject);
        return;
      }

      responseObject.success = true;
      responseObject.response = ordersFromQuickbooks;
      responseObject.message = 'Successfully got the orders from QuickBooks.';
      res.send(responseObject);
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
      /*
      var now = new Date();

      var formData = {
        AWSAccessKeyId : 'AKIAIOKE3I3CIQ7KLTIQ',
        Action : 'GetMatchingProductForId',
        MarketplaceId : 'ATVPDKIKX0DER',
        IdList : ['5055305927700'],
        IdType : 'ASIN',
        SellerId : 'A1AG76L8PLY85T',
        Signature : '',
        SignatureMethod : 'HmacSHA256',
        SignatureVersion : '2',
        Timestamp : now.toISOString()
      };

      var stringToSign = 'POST' + '\n' +
        'mws.amazonservices.com' + '\n' +
        ''

      request.post()
      */
      console.log(mws);

      /*
      mws.products.GetServiceStatus(config, true, function (err, data) {
          console.log("GetServiceStatus:");
          console.log(data.GetServiceStatusResponse.GetServiceStatusResult);
          console.log("\n");
      });

      var params = {
        MarketplaceId : 'ATVPDKIKX0DER',
        IdType : 'ASIN',
        IdList : {
          'IdList.Id.1' : '5055305927700'
        }
      };

      mws.Products.GetMatchingProductForId(config, params, false, function(err, data) {
          console.log(data);
        });
        */
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
  }
}