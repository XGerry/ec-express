var helpers = require('./helpers.js');
var xmlParser = require('xml2js').parseString; 
var request = require('request');
var pixl = require('pixl-xml')
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
var cart3d = require('./3dcart');

var ordersFromQuickbooks = {}; // do it this way for now

// application/json parser
var jsonParser = bodyParser.json({limit : '50mb'});

// application/x-www-form-urlencoded
var formParser = bodyParser.urlencoded({limit : '50mb'});

module.exports = {
  route : function(app, passport, qbws, io) {

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
        res.send(body);
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

      cart3d.getOrders(options, qbws, function(responseObject) {
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

    app.get('/api/quickbooks/salesreceipts', function(req, res) {
      cart3d.getSalesReceipts(qbws);
      res.send('Run Connector');
    });

    app.get('/api/quickbooks/add/salesreceipts', function(req, res) {
      cart3d.addSalesReceipts(qbws);
      res.send('Run Connector Again');
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
      Settings.findOne({}, function(err, settings) {
        Order.find({ imported: false, timecode:settings.lastImport }, function(err, errors) {
          Order.find({ imported: true, timecode:settings.lastImport }, function(err, successes) {
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
              if (doc.cartOrder)
                doc.cartOrder.message = doc.message;
              responseObject.errors.push(doc.cartOrder);
            });

            successes.forEach(function(doc) {
              responseObject.successes.push(doc.cartOrder);
            });

            res.send(responseObject);
          });
        });
      });
    });

    app.get('/api/orders/updateCompleted', function(req, res) {
      Settings.findOne({}, function(err, settings) {
        helpers.markCompletedOrdersAsProcessing([settings.lastImport], function(error, response, body) {
          console.log('Marked orders as processing.');
          console.log(response);
          console.log(body);
          res.send(body);
        });
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
          AWSAccessKeyId: process.env.AWS_ACCESS_KEY,
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

      options.qs.Signature = crypto.createHmac('sha256', process.env.AMAZON_SECRET_KEY)
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
      cart3d.getItems(qbws, function(progress, total) {
        console.log(Math.floor(progress/total*100));
      }, function(items) {
        console.log('Found ' + items.length + ' items.');
      });
      res.send('Getting all the items from 3D Cart.');
    });

    /**
     * This function doesn't do the request to 3D cart and just takes the last
     * information about items to convert to a QBXML
     */
    app.get('/api/sync/inventory/qbxml', function(req, res) {
      helpers.queryAllItems(qbws).then(() => {
        res.send('Run the Web Connector.');
      });
    });

    app.get('/api/test/sync', function(req, res) {
      var id = req.query.id;

      var options = {
        url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
        method: 'GET',
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        },
        qs: {
          onsale: 1
        }
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
     * This route gets the advanced options for all items that have options and then
     * saves their options as items
     */
    app.post('/api/items/advancedoptions', function(req, res) {
      res.writeContinue();
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
              qs: {
                limit: 100
              },
              itemId: items[i].catalogId
            };
            requests.push(JSON.parse(JSON.stringify(options)));
          }

          var counter = 0;
          console.log('Starting the mapping');

          async.mapLimit(requests, 2, function(option, callback) {
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
              }
              toSend.push(optionItem);
            });
            res.json(toSend);
          });
        }
      });
    });

    app.post('/api/sync/inventory', function(req, res) {
      res.writeContinue();
      var savedItems = [];

      // non-options
      cart3d.saveItems(function(progress, total) {
        console.log(Math.floor(progress/total*100));
      }, function(items) {
        savedItems.push(items);
        // options
        cart3d.saveOptionItems(function(progress, total) {
          console.log(Math.floor(progress/total*100));
        }, function(options) {
          savedItems.push(options);
          res.json(savedItems);
        });
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