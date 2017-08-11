/**
 * This will be a helper class for doing the common functions involving 3D Cart
 */
 var request = require('request');
 var async = require('async');
 var Item = require('./model/item');
 var helpers = require('./helpers');

/**
 * Gets items from 3D cart and saves them to the db
 */
function getItems(qbws, notifyCallback, finalCallback) {
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
        notifyCallback(counter, numOfRequests);
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

      // also, always include the options
      Item.find({isOption:true}, function(err, items) {
        if (err) {
          console.log(err);
        } else {
          items.forEach(function(item) {
            qbRq.ItemInventoryQueryRq.FullName.push(item.sku);
          });

          qbRq.ItemInventoryQueryRq.OwnerID = 0;
          var xmlDoc = helpers.getXMLRequest(qbRq);
          var str = xmlDoc.end({pretty:true});
          qbws.addRequest(str);
          qbws.setCallback(helpers.inventorySyncCallback);
          finalCallback(merged);
        }
      });
    });
  });
}

/**
 * Takes the current state of the db and saves it to 3D Cart.
 */ 
function saveItems(progressCallback, finalCallback) {
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
          progressCallback(counter, numOfRequests);
          io.emit('saveItemsProgress', {
            progress: counter,
            total: numOfRequests
          });
        }
      });
    }, function(err, responses) {
      var merged = [].concat.apply([], responses);
      finalCallback(merged);
    });
  });
}

/**
 * Takes the current state of the db (for items that are options)
 * and saves it to 3D Cart.
 */
function saveOptionItems(progressCallback, finalCallback) {
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

      var total = requests.length;
      var counter = 0;

      async.mapLimit(requests, 2, function(option, callback) {
        function doRequest() {
          request(option, function(err, response, body) {
            if (err) {
              callback(err);
            } else {
              callback(null, body);
              counter++;
              progressCallback(counter, total);
            }
          });
        }

        setTimeout(doRequest, 1000);
      }, function(err, responses) {
        var merged = [].concat.apply([], responses);
        finalCallback(merged);
      });
    }
  });
}

module.exports = {
 	getItems: getItems,
 	saveItems: saveItems,
 	saveOptionItems: saveOptionItems
}