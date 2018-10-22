var secureUrlUs = 'https://www.ecstasycrafts.com';
var secureUrlCa = 'https://www.ecstasycrafts.ca';

/**
 * This will be a helper class for doing the common functions involving 3D Cart
 */
var request = require('request');
var async = require('async');
var Item = require('./model/item');
var Order = require('./model/order');
var ShowOrder = require('./model/showOrder');
var CustomOrder = require('./model/customOrder');
var Settings = require('./model/settings');
var Customer = require('./model/customer');
var helpers = require('./helpers');
var webhooks = require('./webhooks');
var pixl = require('pixl-xml');
var rp = require('request-promise-native');

/**
 * Refreshes the inventory in our DB so we know what to use in quickbooks
 */
function refreshFrom3DCart() {
  // get all the items from the US store
  var getUSItems = getItemsFull({}, (progress, total) => {
    process.stdout.write('US: ' + ((progress/total)*100).toFixed(2) + '%\r');
  }, false);

  var getCanadianItems = getItemsFull({}, (progress, total) => {
    process.stdout.write('CA: ' + ((progress/total)*100).toFixed(2) + '%\r');
  }, true);

  return Promise.all([getUSItems, getCanadianItems]);
}

/**
 * Gets items from 3D cart and saves them to the db
 */
function getItems(qbws, notifyCallback) {
  var canProgress = 0;
  var usProgress = 0;
  var canGetItems = getItemsQuick(true, (progress, total) => {
    canProgress = progress;
    notifyCallback(canProgress + usProgress, total * 2);
  });
  var usGetItems = getItemsQuick(false, (progress, total) => {
    usProgress = progress;
    notifyCallback(canProgress + usProgress, total * 2);
  });
  return Promise.all([canGetItems, usGetItems]);
}

function createItemsInDB(items, canadian) {
  items.forEach(skuInfo => {
    var sku = skuInfo.SKU.trim();
    var findItem = Item.findOne({sku: sku});
    findItem.then(dbItem => {
      if (dbItem) {
        dbItem.updateFromSKUInfo(skuInfo, canadian);
      } else {
        var newItem = new Item();
        newItem.sku = sku;
        newItem.updateFromSKUInfo(skuInfo, canadian);
      }
    });
  });
}

function getItemsQuick(canadian, notifyCallback) {
  var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products/skuinfo',
    'GET',
    canadian);
  options.qs = {
    countonly: 1
  }

  return rp(options).then(async body => {
    var totalItems = body.TotalCount;
    var numOfRequests = Math.ceil(totalItems / 200);
    console.log('We need to send ' + numOfRequests + ' requests to get all the items.');
    options.qs.countonly = 0;
    for (var i = 0; i < numOfRequests; i++) {
      notifyCallback(i + 1, numOfRequests);
      options.qs.offset = i * 200;
      options.qs.limit = 200;
      var newInfos = await rp(options);
      createItemsInDB(newInfos, canadian);
    }
    return 'Done';
  });
}

/**
 * Takes the current state of the db and saves it to 3D Cart.
 */ 
function quickSaveItems(query, progressCallback, canadian) {
  var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
    'PUT',
    canadian);

  return Item.find(query).then(async items => {
    var body = [];
    items.forEach(item => {
      var cartItem = item.getCartItem(canadian);
      body.push(cartItem);
    });

    var numOfRequests = Math.ceil(items.length / 100); // can only update 100 items at a time
    console.log('We need to send ' + numOfRequests + ' requests.');
    var requests = [];
    for (var i = 0; i < numOfRequests; i++) {
      progressCallback(i + 1, numOfRequests);
      options.body = body.slice(i * 100, (i + 1) * 100);
      try {
        var response = await rp(options);
      } catch (err) {
        console.log(options);
      }
    }
    return 'Done';
  });
}

function saveItems(query, progressCallback) {
  if (query == null || query == undefined) {
    query = {
      isOption: false,
      updated: true,
      hasOptions: false
    };
  }
  var canProgress = 0;
  var usProgress = 0;

  var usSaveItems = quickSaveItems(query, (progress, total) => {
    usProgress = progress;
    progressCallback(canProgress + usProgress, total * 2);
  }, false);
  var canSaveItems = quickSaveItems(query, (progress, total) => {
    canProgress = progress;
    progressCallback(canProgress + usProgress, total * 2);
  }, true);

  return Promise.all([usSaveItems, canSaveItems]);
}

/**
 * Takes the current state of the db (for items that are options and that are updated)
 * and saves it to 3D Cart.
 */

async function doSaveOptionItems(canadian, items, progressCallback) {
  var allOptions = [];
  items.forEach((item, index) => {
    var options = helpers.get3DCartOptions('',
    'PUT',
    canadian);
    options.body = {
      AdvancedOptionSufix: item.sku
    };
    var url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/';
    if (canadian) {
      url += item.catalogIdCan+'/AdvancedOptions/'+item.optionIdCan;   
      options.body.AdvancedOptionStock = item.canStock;
    } else {
      url += item.catalogId+'/AdvancedOptions/'+item.optionId;
      options.body.AdvancedOptionStock = item.usStock;
    }
    options.url = url;
    allOptions.push(options);
  });

  for (var i = 0; i < allOptions.length; i++) {
    if (i > 30) // can send bursts of up to 30 requests
      await delay(500);
    try {
      var response = await rp(allOptions[i]);
    } catch (err) {
      console.log('Error saving the option item');
    }
    progressCallback(i+1, allOptions.length);
  }

  return 'Done';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function saveOptionItems(progressCallback) {
  return Item.find({isOption: true, inactive: false, updated: true}).then(items => {
    console.log('There are ' + items.length + ' options that need updating.');
    var canProgress = 0;
    var usProgress = 0;
    var canSave = doSaveOptionItems(true, items, (progress, total) => {
      canProgress = progress;
      progressCallback(canProgress + usProgress, total * 2);
    });
    var usSave = doSaveOptionItems(false, items, (progress, total) => {
      usProgress = progress;
      progressCallback(canProgress + usProgress, total * 2);
    });
    return Promise.all([canSave, usSave]);
  });
}

function doSaveAdvancedOptions(canadian, cartItems, finalCallback) {
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

  if (canadian) {
    options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
    options.headers.Token = process.env.CART_TOKEN_CANADA;
  }

  var requests = [];
  console.log('saving options');

  cartItems.forEach(function(item) {
  	options.url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+item.SKUInfo.CatalogID+'/AdvancedOptions/'
  	options.body = item.AdvancedOptionList;
  	requests.push(JSON.parse(JSON.stringify(options)));
  });

  async.mapLimit(requests, 2, function(req, callback) {
  	function doRequest() {
      request(req, function(err, response, body) {
        if (err)
          callback(err);
        else 
          callback(null, body);
        console.log('saved item and options');
      });
    }
    
    setTimeout(doRequest, 1000);
  }, function(err, responses) {
		console.log('done');
    console.log(responses);
		finalCallback(responses);
	});
}

function saveAdvancedOptions(canadian, cartItems, finalCallback, rebuild) {
	if (rebuild) {
		doRebuild(canadian, cartItems, function(items) {
			doSaveAdvancedOptions(canadian, items, finalCallback);
		});
	} else {
		doSaveAdvancedOptions(canadian, cartItems, finalCallback);
	}
}

function doRebuild(canadian, cartItems, finalCallback) {
	async.map(cartItems, function(cartItem, callback) {
    var newOptions = [];

    Item.find({catalogId: cartItem.SKUInfo.CatalogID, isOption: true}, function(err, options) {
      if (err) {
        console.log(err);
      } else {
        options.forEach(function(option) {
          // go through the options on 3D Cart to match up the ids
          // The only thing that remains the same is the name
          var optionId = option.optionId;

          cartItem.AdvancedOptionList.forEach(function(advancedOption) {
            if (advancedOption.AdvancedOptionName == option.name) {
              optionId = advancedOption.AdvancedOptionCode;
              if (canadian) {
                option.optionIdCan = optionId;
              } else {
                option.optionId = optionId;
              }
              option.save();
            }
          });

          var newOption = {
            AdvancedOptionSufix: option.sku,
            AdvancedOptionStock: option.stock,
            AdvancedOptionName: option.name,
            AdvancedOptionPrice: option.usPrice,
            AdvancedOptionCode: optionId
          };
          console.log(newOption);
          newOptions.push(newOption);
        });

        cartItem.AdvancedOptionList = newOptions;
        callback(null, cartItem);
      }
    });
  }, function(err, results) {
		finalCallback(results);
	});
}

function getOrder(query, canadian) {
  var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders', 'GET', canadian);
  options.qs = query;
  var doRequest = rp(options);
  return doRequest.then(orders => {
    return orders;
  }).catch(err => {
    console.log(err);
    return [];
  });
}

/**
 * Just get the order information
 */
function loadOrders(query, canadian) {
  var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders',
    'GET',
    canadian);
  options.qs = query;
  var doRequest = rp(options);
  return doRequest.then(orders => {
    return orders;
  }).catch(err => {
    //console.log(err);
    console.log('no orders found');
    return [];
  });
}

function loadItems(query, canadian) {
  var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
    'GET',
    canadian);
  options.qs = query;
  var doRequest = rp(options);
  return doRequest.then(products => {
    return products;
  }).catch(err => {
    //console.log(err);
    console.log('no items found');
    return [];
  });
}

/** 
 * Get the order information, but also the item info
 */
function loadOrdersForManifest(query, canadian) {
  var loadingOrders = loadOrders(query, canadian);
  return loadingOrders.then((orders) => {
    var promises = [];
    var htcPromises  = [];
    orders.forEach((order) => {
      var totalItems = 0;
      var totalWeight = 0;
      var totalValue = 0;
      order.OrderItemList.forEach((item) => {
        totalItems += item.ItemQuantity;
        totalValue += item.ItemQuantity * item.ItemUnitPrice;
        totalWeight += parseFloat(item.ItemWeight);
        var findItem = Item.findOne({sku: item.ItemID});
        var saveOrderItem = findItem.then(dbItem => {
          if (dbItem) {
            if (dbItem.countryOfOrigin != undefined && dbItem.countryOfOrigin != '') {
              item.CountryOfOrigin = dbItem.countryOfOrigin.toUpperCase();
            } else {
              item.CountryOfOrigin = 'CHINA'; // default
            }
            if (dbItem.htcCode != undefined && dbItem.countryOfOrigin != '') {
              item.HTC = dbItem.htcCode.replace(/\./g, ' ');
            } else {
              item.HTC = '9503 00 00 90'; // default
            }
          } else { // assign defaults
            item.CountryOfOrigin = 'CHINA';
            item.HTC = '9503 00 00 90';
          }
        });
        order.totalItems = totalItems;
        order.totalValue = totalValue;
        order.totalWeight = totalWeight;
        promises.push(saveOrderItem);
      });

      var htcPromise = Promise.all(promises).then(() => {
        // order now contains all the manifest information
        order.htcMap = generateHTCMap(order);
      });
      htcPromises.push(htcPromise);

    });
    return Promise.all(htcPromises).then(() => {
      return orders;
    });
  });
}

// generate the htcMap
function generateHTCMap(order) {
  htcMap = {};
  order.OrderItemList.forEach((item) => {
    if (!htcMap.hasOwnProperty(item.HTC)) {
      htcMap[item.HTC] = {};
    }
    var htcObj = htcMap[item.HTC];
    if (!htcObj.hasOwnProperty(item.CountryOfOrigin)) {
      htcObj[item.CountryOfOrigin] = {
        quantity: 0,
        value: 0
      };
    }
    htcMap[item.HTC][item.CountryOfOrigin].quantity += item.ItemQuantity;
    htcMap[item.HTC][item.CountryOfOrigin].value += item.ItemQuantity * item.ItemUnitPrice;
  });
  return htcMap;
}

/**
 * For importing orders into quickbooks
 */

function getOrdersQuick(query) {
  helpers.setTimeCode();
  var findSettings = Settings.findOne({});
  findSettings.then(settings => {
    if (settings) {
      var timecode = helpers.getTimeCode();
      settings.lastImport = timecode;
      if (!Array.isArray(settings.lastImports)) {
        settings.lastImports = [];
      }
      settings.lastImports.push(timecode);
      settings.save();
    } else {
      var newSettings = new Settings();
      var timecode = helpers.getTimeCode();
      newSettings.lastImport = timecode;
      newSettings.lastImports.push(timecode);
      newSettings.save();
    }
  });

  query.countonly = 1;
  var usOptions = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders',
    'GET',
    false);
  usOptions.qs = query;
  var canOptions = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders',
    'GET',
    true);
  canOptions.qs = query;

  return Promise.all([doOrderRequest(usOptions), doOrderRequest(canOptions)]).then(responses => {
    return [].concat.apply([], responses);
  });
}

function doOrderRequest(options) {
  var getOrderCount = rp(options);
  return getOrderCount.then(body => {
    options.qs.countonly = 0;
    var promises = [];
    var numberOfOrders = body.TotalCount;
    var numOfRequests = Math.ceil(numberOfOrders / 200); // can always get 200 records
    console.log('We need to do ' + numOfRequests + ' requests to get all the orders');
    for (var i = 0; i < numOfRequests; i++) {
      options.qs.offset = i * 200;
      promises.push(rp(options));
    }
    return Promise.all(promises);
  });
}

async function getOrders(query, qbws) {
  var getAllOrders = getOrdersQuick(query);
  return getAllOrders.then(responses => {
    console.log('Successfully received the orders');
    var merged = [].concat.apply([], responses);
    var promises = [];
    for (order of merged) {
      await createOrderInDB(order);
    }

    helpers.createSalesOrdersRequests(qbws);

    qbws.addFinalCallback(() => {
      console.log('Generating Report');
      var findSettings = Settings.findOne({});
      return findSettings.then(settings => {
        var orderReport = helpers.getOrderReport(settings);
        return orderReport.then((report) => {
          webhooks.orderBot(helpers.getSlackOrderReport(report));
          settings.lastImports = [];
          return settings.save();
        });
      });
    });
    return merged.length;
  }).catch(err => {
    console.log(err);
    return 0;
  });
}

function createOrderInDB(order) {
  var orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;
  var findOrder = Order.findOne({orderId: orderId});
  return findOrder.then(dbOrder => {
    if (dbOrder) {
      if (dbOrder.imported == false) { // can still update the order
        return dbOrder.updateFrom3DCart(order);
      } else {
        dbOrder.timecode = helpers.getTimeCode();
        return dbOrder.save();
      }
    } else {
      var newOrder = new Order();
      newOrder.orderId = orderId;
      newOrder.imported = false;
      newOrder.retry = false;
      newOrder.timecode = helpers.getTimeCode();
      return newOrder.updateFrom3DCart(order);
    }
  });
}

async function getItemsFull(query, progressCallback, canadian) {
  // find out how many products we have
	query.countonly = 1;
	var url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products';
	
	if (query.categoryid != undefined && query.categoryid != '') { 
		url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Categories/'+query.categoryid+'/Products';
	}
	delete query.categoryid;

  if (query.sku != undefined && query.sku != '') {
    url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products';
  } else {
    delete query.sku;
  }

  if (query.manufacturer != undefined && query.manufacturer != '') {
    url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Manufacturers/'+query.manufacturer+'/Products';
    delete query.manufacturer;
  } else {
    delete query.manufacturer;
  }

	if (query.onsale) {
		query.onsale = 1;
	} else {
		delete query.onsale;
	}
  delete query.canadian; // legacy

  var options = helpers.get3DCartOptions(url, 'GET', canadian);
  options.qs = query;
  await rp(options).then(async response => {
    var promises = [];
    var totalItems = response.TotalCount;
    var numOfRequests = Math.ceil(totalItems / 200); // max 200 per request
    options.qs.countonly = 0;
    options.qs.limit = 200;
    console.log('We need to send ' + numOfRequests + ' requests to 3D Cart.');

    for (var i = 0; i < numOfRequests; i++) {
      options.qs.offset = i * 200; 
      var cartItems = await rp(options);
      progressCallback(i + 1, numOfRequests, cartItems);
      var responses = await bulkUpdateCartItems(cartItems, canadian);
    }
  });
}

async function bulkUpdateCartItems(cartItems, canadian) {
  for (item of cartItems) {
    var sku = item.SKUInfo.SKU.trim();
    var saveItem = Item.findOne({sku: sku}).then(dbItem => {
      if (dbItem) {
        return dbItem.updateFrom3DCart(item, canadian);
      } else {
        var newItem = new Item();
        newItem.sku = sku;
        return newItem.updateFrom3DCart(item, canadian);
      }
    });
    await saveItem;
  }
}

function updateItemsFromDB(progressCallback, finalCallback) {
  Item.find({}, function(err, items) {
    if (err) {
      console.log(err);
    } else {
      var itemsToSend = [];
      items.forEach(function(item) {
        var itemToSend = {
          SKUInfo: {
            SKU: item.sku,
            RetailPrice: item.usPrice
          },
          PriceLevel1: item.usPrice
        }
        itemsToSend.push(itemToSend);
      });

      console.log('Found ' + items.length + ' items.');

      var numOfRequests = Math.ceil(itemsToSend.length / 100);
      console.log('We need to send ' + numOfRequests + ' requests to 3D Cart - updating from DB');

      var options = {
        url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
        method: 'PUT',
        headers : {
          SecureUrl : 'https://www.ecstasycrafts.com',
          PrivateKey : process.env.CART_PRIVATE_KEY,
          Token : process.env.CART_TOKEN
        },
        body: itemsToSend,
        json: true
      };

      var requests = [];

      for (var i = 0; i < numOfRequests; i++) {
        var requestBody = itemsToSend.slice(i*100, (i+1)*100);

        // US
        options.headers.SecureUrl = 'https://www.ecstasycrafts.com';
        options.headers.Token = process.env.CART_TOKEN;
        options.body = requestBody;
        requests.push(JSON.parse(JSON.stringify(options)));

        // Canadian
        options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
        options.headers.Token = process.env.CART_TOKEN_CANADA;
        requestBody.forEach(function(item) {
          var cad = (item.PriceLevel1 * 1.10).toFixed(2);
          item.SKUInfo.RetailPrice = cad;
        });
        requests.push(JSON.parse(JSON.stringify(options)));
      }

      var counter = 0;

      async.mapLimit(requests, 4, function(option, callback) {
        function doRequest() {
          request(option, function(err, response, body) {
            if (err) {
              callback(err);
            } else {
              callback(null, body);
              counter++;
              progressCallback(counter, numOfRequests * 2);
            }
          });
        }

        setTimeout(doRequest, 1000);
      }, function(err, responses) {
        var merged = [].concat.apply([], responses);
        console.log('Finished Update.');
        finalCallback(merged);
      });
    }
  });
}

/**
 * Takes all the updated items in our database and writes them to Quickbooks
 * Pricing only
 */
function updateQuickbooks(qbws) {
  return Item.find({}).then(items => {
    console.log('Modifying ' + items.length + ' items in quickbooks.');
    items.forEach(function(item) {
      helpers.saveToQuickbooks(item, qbws);
    });
    return 'Done';
  });
}

function getCategories(finalCallback) {
  var options = {
    url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Categories',
    headers : {
      SecureUrl : 'https://www.ecstasycrafts.com',
      PrivateKey : process.env.CART_PRIVATE_KEY,
      Token : process.env.CART_TOKEN
    },
    qs: {
      countonly: 1
    }
  };

  // Canada
  //options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
  //options.headers.Token = process.env.CART_TOKEN_CANADA;

  request(options, function(err, response, body) {
    var numOfCategories = JSON.parse(body).TotalCount;
    var numOfRequests = Math.ceil(numOfCategories / 200);
    var requests = [];
    delete options.qs.countonly;
    console.log('We need to do ' + numOfRequests + ' requests to get the categories.');
    
    for (var i = 0; i < numOfRequests; i++) {
      options.qs.limit = 200;
      options.qs.offset = i * 200;
      requests.push(JSON.parse(JSON.stringify(options)));
    }

    async.mapSeries(requests, function(option, callback) {
      request(option, function(err, response, body) {
        if (err) {
          callback(err);
        } else {
          console.log('received');
          callback(null, JSON.parse(body));
        }
      });
    }, function(err, responses) {
      var merged = [].concat.apply([], responses);
      console.log('done.');
      finalCallback(merged);

      updateCategories(merged, function(responses) {
        console.log('done updating');
      });
    });
  });
}

function updateCategories(categories, finalCallback) {
  var options = {
    url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Categories',
    headers : {
      SecureUrl : 'https://www.ecstasycrafts.com',
      PrivateKey : process.env.CART_PRIVATE_KEY,
      Token : process.env.CART_TOKEN
    }
  };
  options.method = "POST";
  options.body = categories[0];
  options.json = true;
  options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
  options.headers.Token = process.env.CART_TOKEN_CANADA;
  
  var numOfRequests = Math.ceil(categories.length);
  console.log('We need to do ' + numOfRequests + ' requests to save all the categories');
  var requests = [];

  for (var i = 0; i < numOfRequests; i++) {
    options.body = categories[i];
    requests.push(JSON.parse(JSON.stringify(options)));
  }

  async.mapLimit(requests, 2, function(option, callback) {
    function doRequest() {
      request(option, function(err, response, body) {
        if (err) {
          callback(err);
        } else {
          callback(null, body);
          console.log(body);
          console.log('sent.');
        }
      });
    }

    setTimeout(doRequest, 500);
  }, function(err, responses) {
    console.log(responses);
    finalCallback(responses);
  });
}

function saveItem(item, qbws, adjustInventory) {
  helpers.saveItem(item, qbws, adjustInventory);

  if (!item.isOption) {
    // US Website
    var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
      'PUT',
      false);

    var body = [{
      SKUInfo: {
        Price: item.usPrice,
        SKU: item.sku,
        RetailPrice: item.usPrice,
        Name: item.name,
        Stock: item.usStock,
        OnSale: item.onSale,
        SalePrice: item.usSalePrice
      },
      PriceLevel1: item.usPrice,
      //MFGID: item.sku,
      WarehouseLocation: item.location,
      GTIN: item.barcode,
      ExtraField8: item.barcode,
      ExtraField9: item.countryOfOrigin,
      Hide: item.hidden
    }];

    if (item.inactive == true) {
      body[0].SKUInfo.Stock = 0;
    }

    options.body = body;
    var usSave = rp(options);

    // save to canadian site
    var canOptions = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
      'PUT',
      true); 
    canOptions.body = body;
    canOptions.body[0].SKUInfo.Price = item.canPrice;
    canOptions.body[0].SKUInfo.RetailPrice = item.canPrice;
    canOptions.body[0].SKUInfo.SalePrice = item.canSalePrice;
    canOptions.body[0].SKUInfo.Stock = item.canStock;
    canOptions.body[0].PriceLevel1 = item.canPrice;
    var canSave = rp(canOptions);

    return Promise.all([canSave, usSave]).then(responses => {
      console.log('saved item for both sites');
      console.log(responses);
      return responses;
    });
  } else {
    // Options
    var options = helpers.get3DCartOptions('', 'PUT', false);

    var optionBody = {
      AdvancedOptionStock: item.usStock,
      AdvancedOptionSufix: item.sku,
      AdvancedOptionPrice: item.usPrice,
      AdvancedOptionName: item.name
    }

    options.body = optionBody;
    var url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+item.catalogId+'/AdvancedOptions/'+item.optionId;
    options.url = url;
    var usSave = rp(options);
    var canOptions = helpers.get3DCartOptions('', 'PUT', true);
    canOptions.url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+item.catalogIdCan+'/AdvancedOptions/'+item.optionIdCan;
    canOptions.body = optionBody;
    canOptions.body.AdvancedOptionPrice = item.canPrice;
    canOptions.body.AdvancedOptionStock = item.canStock;
    var canSave = rp(canOptions);

    return Promise.all([usSave, canSave])
      .catch(err => {
        return err;
      })
      .then(responses => {
        console.log('Saved options for both sites');
        console.log(responses);
        return responses;
      });
  }
}

function saveOrder(order, orderId, isCanadian) {
  var method = 'POST';
  var url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Orders';
  if (orderId != null && orderId != '') {
    method = 'PUT';
    url += '/'+orderId;
  }

  var options = helpers.get3DCartOptions(url, method, isCanadian);

  options.body = order;
  return rp(options);
}

async function saveItemMultiple(items, qbws) {
  for (let item of items) {
    try {
      await saveItem(item, qbws, true);  
    } catch (err) {
      console.log(err);
      console.log('moving on...');
    }
    await delay(200); 
  }
  return 'Done.';
}

function saveCustomOrder(order, saveToSite) {
  var findOrder;
  if (order._id) {
    findOrder = CustomOrder.findOne({_id: order._id});
  } else {
    findOrder = CustomOrder.findOne({orderId: order.orderId, "customer.website": order.customer.website});
  }
  
  var savingOrder = findOrder.then(dbOrder => {
    if (dbOrder) {
      var now = new Date();
      dbOrder.customer = order.customer;
      dbOrder.items = order.items;
      dbOrder.discount = order.discount;
      dbOrder.tax = order.tax;
      dbOrder.shipping = order.shipping;
      dbOrder.comments = order.comments;
      dbOrder.shippingMethod = order.shippingMethod;
      dbOrder.poNumber = order.poNumber;
      dbOrder.markModified('customer');
      dbOrder.markModified('items');
      dbOrder.lastModified = now;
      return dbOrder.save();
    } else {
      var now = new Date();
      var newOrder = new CustomOrder();
      newOrder.customer = order.customer;
      newOrder.items = order.items;
      newOrder.discount = order.discount;
      newOrder.tax = order.tax;
      newOrder.shipping = order.shipping;
      newOrder.shippingMethod = order.shippingMethod;
      newOrder.comments = order.comments;
      newOrder.poNumber = order.poNumber;
      newOrder.createdDate = now;
      newOrder.lastModified = now;
      return newOrder.save();
    }
  });

  return savingOrder.then(dbOrder => {
    if (saveToSite) {
      var cartOrder = buildCartOrder(dbOrder.customer);
      var comments = dbOrder.comments;
      if (comments != null || comments != '') {
        comments += '\n';
        comments += 'PO: ' + dbOrder.poNumber;
      }

      cartOrder.InternalComments = 'Custom Order';
      cartOrder.CustomerComments = comments;
      cartOrder.SalesTax = dbOrder.tax;
      cartOrder.ShipmentList[0].ShipmentCost = dbOrder.shipping;
      cartOrder.ShipmentList[0].ShipmentMethodName = dbOrder.shippingMethod;
      cartOrder.OrderDiscountPromotion = dbOrder.discount;

      dbOrder.items.forEach(item => {
        var orderItem = buildOrderItem(item, dbOrder.customer);
        cartOrder.OrderItemList.push(orderItem);
      });

      var saveToWebsite = saveOrder(cartOrder, dbOrder.orderId, dbOrder.customer.website == 'canada');
      return saveToWebsite.then((response) => {
        if (response[0].Status == '201' || response[0].Status == '200') { // success
          dbOrder.orderId = response[0].Value;
          return getOrderInvoiceNumber(dbOrder);
        }
      }).catch((message) => {
        return Promise.reject(new Error(message));
      });
    } else {
      return dbOrder;
    }
  });
}

function buildOrderItem(item, customer) {
  var quantity = item.quantity;
  var stock = item.stock;

  if (customer.website == 'canada') {
    stock = item.canStock;
  } else {
    stock = item.usStock;
  }

  // if (stock < quantity) {
  //   quantity = stock;
  // }
  // if (quantity <= 0) {
  //   quantity = 0;
  // }

  var orderItem = {
    ItemID: item.sku,
    ItemQuantity: quantity,
    ItemUnitPrice: item.salesPrice,
    ItemDescription: item.name,
    ItemUnitStock: stock
  };
  return orderItem;
}

function buildCartOrder(customer) {
  var cartOrder = {
    BillingFirstName: customer.firstname,
    BillingLastName: customer.lastname,
    BillingAddress: customer.billingAddress,
    BillingAddress2: customer.billingAddress2,
    BillingCompany: customer.companyName,
    BillingCity: customer.billingCity,
    BillingState: customer.billingState,
    BillingCountry: customer.billingCountry,
    BillingZipCode: customer.billingZipCode,
    BillingPhoneNumber: customer.phone,
    BillingEmail: customer.email,
    BillingPaymentMethod: 'On Account',
    BillingPaymentMethodID: '49', // need to look up all of these
    ShipmentList: [{
      ShipmentOrderStatus: 1, // NEW
      ShipmentFirstName: customer.shipmentFirstName,
      ShipmentLastName: customer.shipmentLastName,
      ShipmentCompany: customer.shipmentCompany,
      ShipmentAddress: customer.shippingAddress,
      ShipmentAddress2: customer.shippingAddress2,
      ShipmentCity: customer.shippingCity,
      ShipmentState: customer.shippingState,
      ShipmentCountry: customer.shippingCountry,
      ShipmentZipCode: customer.shippingZipCode,
      ShipmentPhone: customer.shipmentPhone
    }],
    OrderItemList: [],
    OrderStatusID: 1 // NEW
  };
  return cartOrder;
}

function invoiceOrder(order) {
  order.OrderItemList.forEach(item => {
    item.ItemQuantity = item.quantityPicked;
  });
  delete order.PaymentTokenID;

  return saveOrder(order, order.OrderID, order.InvoiceNumberPrefix == 'CA-');
}

function searchCustomer(email, canadian) {
  var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Customers', 'GET', canadian);
  options.qs = {
    email: email
  };

  var findCustomer = rp(options);
  return findCustomer.then(response => {
    return response;
  }).catch(err => {
    return [];
  });
}

function moveOrders(from, to, canadian) {
  var getCount = loadOrders({orderstatus: from, countonly: 1}, canadian);
  console.log('is canadian? ' + canadian);
  getCount.then(async info => {
    var totalCount = info.TotalCount;
    var numOfRequests = Math.ceil(totalCount / 50);
    console.log('we need to send ' + numOfRequests + ' requests.');

    for (var i = 0; i < numOfRequests; i++) {
      var doOrderRequest = loadOrders({orderstatus: from, limit: 50}, canadian);
      var saveOrders = doOrderRequest.then(orders => {
        console.log('Moving ' + orders.length + ' orders to status code: ' + to);
        var ordersToSave = [];
        orders.forEach(order => {
          var toOrder = {
            OrderID: order.OrderID,
            OrderStatusID: to
          };
          ordersToSave.push(toOrder);
        });
        var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders', 'PUT', canadian);
        options.body = ordersToSave;
        return rp(options);
      });
      var response = await saveOrders; // save the orders first, before we try to get the next batch
      console.log(response);
    }
  });
}

function calculateBaseItemStock(progressCallback) {
  var findItemsWithOptions = Item.find({hasOptions: true});
  var promises = [];
  return findItemsWithOptions.then(async itemsWithOptions => {
    console.log('found ' + itemsWithOptions.length);
    itemsWithOptions.forEach(dbItem => {
      var query = {
        isOption: true,
        catalogId: dbItem.catalogId
      }
      var findOptions = Item.find(query);
      var getCartItem = findOptions.then(options => {
        var stock = 0;
        options.forEach(option => {
          stock += option.usStock;
        });
        var cartItem = {
          SKUInfo: {
            SKU: dbItem.sku,
            Stock: stock
          }
        };
        return cartItem;
      });

      promises.push(getCartItem);
    });

    return Promise.all(promises).then(async cartItems => {
      var numOfRequests = Math.ceil(cartItems.length / 100);
      var usCartOptions = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
          'PUT',
          false);
      var canCartOptions = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
          'PUT',
          true);
      console.log('We need to do ' + numOfRequests + ' requests');
      for (var i = 0; i < numOfRequests; i++) {
        var body = cartItems.slice(i * 100, (i + 1) * 100);
        usCartOptions.body = body;
        canCartOptions.body = body;
        var response = await Promise.all([rp(usCartOptions), rp(canCartOptions)]);
        process.stdout.write('Request number ' + (i + 1)+'\r');
        progressCallback(i + 1, numOfRequests);
      }
      return 'Done!';
    });
  });
}

function getManufacturers(canadian) {
  var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Manufacturers', 'GET', canadian);
  options.qs = {
    limit: 200
  }
  return rp(options);
}

function getOrderInvoiceNumber(dbCustomOrder) {
  var canadian = dbCustomOrder.customer.website == 'canada';
  if (dbCustomOrder.orderId) {
    var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders/'+dbCustomOrder.orderId,
    'GET', 
    canadian);
    return rp(options).then(response => {
      console.log(response);
      dbCustomOrder.invoiceNumber = response[0].InvoiceNumberPrefix + response[0].InvoiceNumber;
      return dbCustomOrder.save();
    });
  } else {
    return 'Does not exist in 3D Cart';
  }
}

async function createItems(itemList) {
  var promises = [];
  var responses = [];
  itemList.forEach(item => {
    var cartItemUS = {
      SKUInfo: {
        SKU: item.id,
        Name: item.name,
        Cost: item.cost,
        RetailPrice: item.price,
        Price: item.price
      },
      MFGID: item.id,
      ManufacturerName: item.manufacturer,
      Hide: true
    };
    if (item.gtin) {
      cartItemUS.ExtraField8 = item.gtin;
      cartItemUS.GTIN = item.gtin;
    }
    if (item.extra_field_9) {
      cartItemUS.ExtraField9 = item.extra_field_9;
    }
    var cartItemCan = {
      SKUInfo: {
        SKU: item.id,
        Name: item.name,
        Cost: item.cost
        //Price: item.price,
        //RetailPrice: item.price
      },
      MFGID: item.id,
      ManufacturerName: item.manufacturer,
      Hide: true
    };
    if (item.gtin) {
      cartItemCan.ExtraField8 = item.gtin;
      cartItemCan.GTIN = item.gtin;
    }
    if (item.extra_field_9) {
      cartItemCan.ExtraField9 = item.extra_field_9;
    }

    var usOptions = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
      'POST', false);
    usOptions.body = cartItemUS;
    var canOptions = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
      'POST', true);
    canOptions.body = cartItemCan;
    promises.push(usOptions);
    promises.push(canOptions);
  });

  for (let prom of promises) {
    let response = await rp(prom);
    await delay(200);
    responses.push(response);
  }
  return responses;
}

module.exports = {
 	getItems: getItems,
  refreshFrom3DCart: refreshFrom3DCart,
 	saveItems: saveItems, // for inventory
 	saveOptionItems: saveOptionItems,
 	saveAdvancedOptions: saveAdvancedOptions,
 	getOrders: getOrders,
 	getItemsFull: getItemsFull,
  updateQuickbooks: updateQuickbooks,
  getCategories: getCategories,
  updateItemsFromDB: updateItemsFromDB,
  saveCategories: updateCategories,
  saveItem: saveItem,
  saveItemMultiple: saveItemMultiple,
  saveOrder: saveOrder,
  getOrder: getOrder,
  loadOrders: loadOrders,
  loadItems: loadItems,
  loadOrdersForManifest: loadOrdersForManifest,
  searchCustomer: searchCustomer,
  saveCustomOrder: saveCustomOrder,
  moveOrders: moveOrders,
  calculateBaseItemStock: calculateBaseItemStock,
  getManufacturers: getManufacturers,
  getOrderInvoiceNumber: getOrderInvoiceNumber,
  createItems: createItems,
  invoiceOrder: invoiceOrder
}