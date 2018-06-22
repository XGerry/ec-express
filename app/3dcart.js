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
var Receipt = require('./model/receipt');
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

function updateItemsFromSKUInfo(item, skuInfo, canadian) {
  item.name = skuInfo.Name;
  item.isOption = false;
  item.updated = false;
  item.onSale = skuInfo.OnSale;
  if (canadian == true) {
    item.catalogIdCan = skuInfo.CatalogID;
    item.canPrice = skuInfo.Price;
    item.canSalePrice = skuInfo.SalePrice;
    item.canStock = skuInfo.Stock;
  } else {
    item.catalogId = skuInfo.CatalogID;
    item.usPrice = skuInfo.Price;
    item.usStock = skuInfo.Stock;
    item.usSalePrice = skuInfo.SalePrice;
    item.cost = skuInfo.Cost;
  }
  item.save();
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
        updateItemsFromSKUInfo(dbItem, skuInfo, canadian);
      } else {
        var newItem = new Item();
        newItem.sku = sku;
        updateItemsFromSKUInfo(newItem, skuInfo, canadian);
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
      var cartItem = buildCartItem(item, canadian);
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

function buildCartItem(item, canadian) {
  var cartItem = {
    SKUInfo: {
      SKU: item.sku,
    },
    MFGID: item.sku,
    WarehouseLocation: item.location,
    ExtraField8: item.barcode,
    ExtraField9: item.countryOfOrigin
  };

  if (canadian == true) {
    cartItem.SKUInfo.Stock = item.canStock;
  } else {
    cartItem.SKUInfo.Stock = item.usStock;
  }

  if (item.inactive && !item.hasOptions) {
    cartItem.SKUInfo.Stock = 0;
    //cartItem.Hide = true;
  }

  if (!item.inactive) {
    //cartItem.Hide = false;
  }

  return cartItem;
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
    if (i > 30) // can send bursts of up to 50 requests
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
    console.log(err);
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
    console.log(err);
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

function getOrders(query, qbws) {
  var getAllOrders = getOrdersQuick(query);
  return getAllOrders.then(responses => {
    console.log('Successfully received the orders');
    var merged = [].concat.apply([], responses);
    var promises = [];
    merged.forEach(order => {
      promises.push(createOrderInDB(order));
    });

    return Promise.all(promises).then(newOrders => {
      helpers.createInvoiceRequests(qbws);
      qbws.addFinalCallback(() => {
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

      return newOrders.length;
    });
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
      dbOrder.retry = true;
      return updateOrderInfo(dbOrder, order);
    } else {
      var newOrder = new Order();
      newOrder.orderId = orderId;
      newOrder.imported = false;
      newOrder.retry = false;
      return updateOrderInfo(newOrder, order);
    }
  });
}

function updateOrderInfo(order, cartOrder) {
  order.name = cartOrder.BillingFirstName + ' ' + cartOrder.BillingLastName;
  order.cartOrder = cartOrder;
  order.canadian = cartOrder.InvoiceNumberPrefix == 'CA-';
  order.timecode = helpers.getTimeCode();
  return order.save();
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
  console.log(options);
  await rp(options).then(async response => {
    console.log(response);
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
      promises.push(bulkUpdateCartItems(cartItems, canadian));
    }

    return Promise.all(promises);
  });
}

function bulkUpdateCartItems(cartItems, canadian) {
  var promises = [];
  cartItems.forEach(item => {
    var sku = item.SKUInfo.SKU.trim();
    Item.findOne({sku: sku}).then(dbItem => {
      if (item) {
        promises.push(updateItemFields(dbItem, item, canadian));
      } else {
        var newItem = new Item();
        newItem.sku = sku;
        promises.push(updateItemFields(dbItem, item, canadian));
      }
    });
  });
  return Promise.all(promises);
}

function updateItemFields(item, cartItem, canadian) {
  var promises = [];
  // common attributes
  item.onSale = cartItem.SKUInfo.OnSale;
  item.description = cartItem.Description;
  item.imageURL = cartItem.MainImageFile;
  item.name = cartItem.SKUInfo.Name;
  item.weight = cartItem.Weight;
  item.manufacturerName = cartItem.ManufacturerName;
  item.hidden = cartItem.Hide;

  var categories = [];
  cartItem.CategoryList.forEach(function(category) {
    categories.push(category.CategoryName);
  });
  item.categories = categories;

  if (cartItem.ExtraField8 != '' && cartItem.ExtraField8 != undefined) {
    item.barcode = cartItem.ExtraField8;
  }

  if (canadian) {
    item.canPrice = cartItem.SKUInfo.Price;
    item.catalogIdCan = cartItem.SKUInfo.CatalogID;
    item.canLink = cartItem.ProductLink;
    item.canStock = cartItem.SKUInfo.Stock;
    item.canWholesalePrice = cartItem.PriceLevel7; // Canadian Wholesale Price
  }
  else {
    item.usPrice = cartItem.SKUInfo.Price;
    item.catalogId = cartItem.SKUInfo.CatalogID;
    item.usLink = cartItem.ProductLink;
    item.manufacturerId = cartItem.ManufacturerID;
    item.usStock = cartItem.SKUInfo.Stock;
    item.usWholesalePrice = cartItem.PriceLevel2; // US Wholesale Price
    item.cost = cartItem.SKUInfo.Cost;
  }

  if (cartItem.AdvancedOptionList.length > 0) {
    item.hasOptions = true;
    // save the options
    cartItem.AdvancedOptionList.forEach(optionItem => {
      var optionSKU = optionItem.AdvancedOptionSufix.trim();
      Item.findOne({sku: optionSKU}).then(advancedOption => {
        if (advancedOption) {
          promises.push(updateAdvancedOptionFields(advancedOption, cartItem, optionItem, canadian));
        } else if (optionItem.AdvancedOptionSufix != '') {
          var newOption = new Item();
          newOption.sku = optionSKU;
          promises.push(updateAdvancedOptionFields(newOption, cartItem, optionItem, canadian));
        }
      });
    });
  } else {
    item.hasOptions = false;
  }

  if (cartItem.Width != 0) {
    item.width = cartItem.Width;
  }

  if (cartItem.Height != 0) {
    item.length = cartItem.Height;
  }
  
  promises.push(item.save());
  return Promise.all(promises);
}

function updateAdvancedOptionFields(advancedOption, cartItem, optionItem, canadian) {
  advancedOption.name = cartItem.SKUInfo.Name + ' - ' + optionItem.AdvancedOptionName;
  if (canadian) {
    advancedOption.optionIdCan = optionItem.AdvancedOptionCode;
    advancedOption.catalogIdCan = cartItem.SKUInfo.CatalogID; // Parent Item
    advancedOption.canPrice = optionItem.AdvancedOptionPrice;
    advancedOption.canWholesalePrice = cartItem.PriceLevel7;
    advancedOption.canLink = cartItem.ProductLink;
    advancedOption.canStock = optionItem.AdvancedOptionStock;
  }
  else {
    advancedOption.usPrice = optionItem.AdvancedOptionPrice;
    advancedOption.usWholesalePrice = cartItem.PriceLevel2;
    advancedOption.catalogId = cartItem.SKUInfo.CatalogID; // Parent Item
    advancedOption.optionId = optionItem.AdvancedOptionCode;
    advancedOption.usLink = cartItem.ProductLink;
    advancedOption.usStock = optionItem.AdvancedOptionStock;
    advancedOption.imageURL = cartItem.MainImageFile;
  }

  advancedOption.manufacturerName = cartItem.ManufacturerName;
  advancedOption.weight = cartItem.Weight;
  advancedOption.isOption = true;
  return advancedOption.save();
}

/**
 * toFixed() has some rounding issues
 */
function updateItems(cartItems, bulkUpdates, progressCallback, finalCallback) { // careful with this function!!
	var itemsToSend = [];
	cartItems.forEach(function(item) {
		// apply bulk updates
		if (bulkUpdates.priceIncrease != '' || bulkUpdates.priceIncrease != undefined) {
			var percentIncrease = (bulkUpdates.priceIncrease / 100) + 1;
			var originalPrice = item.SKUInfo.Price
			var newPrice = (originalPrice * percentIncrease).toFixed(2);

			console.log(newPrice);

      item.SKUInfo.Price = newPrice;
			item.SKUInfo.RetailPrice = newPrice;
			item.PriceLevel2 = (newPrice / 2).toFixed(2); // U.S. Wholesale
			item.SKUInfo.Canadian = newPrice * 1.10; // Canadian Markup
		}

    if (bulkUpdates.categoryToAdd != '' || bulkUpdates != undefined) {
      item.CategoryList.push({
        CategoryID: bulkUpdates.categoryToAdd
      });
    }

    if (bulkUpdates.categoryToRemove != '' || bulkUpdates.categoryToRemove != undefined) {
      var categories = item.CategoryList;
      var indexToRemove = -1;
      for (var i = 0; i < categories.length; i++) {
        if (categories[i].CategoryID == bulkUpdates.categoryToRemove) {
          indexToRemove = i;
          break;
        }
      }

      if (indexToRemove > -1) {
        item.CategoryList.splice(indexToRemove, 1);
      }
    }

		if (bulkUpdates.onSale != '' || bulkUpdates.onSale != undefined) {
			item.SKUInfo.OnSale = bulkUpdates.onSale;
		}
    
		var newItem = {
			SKUInfo: item.SKUInfo,
			PriceLevel2: item.PriceLevel2,
			PriceLevel7: item.PriceLevel7,
      CategoryList: item.CategoryList
		};

		itemsToSend.push(newItem);

		// after we're done updating, let's save the item in our Database
		Item.findOne({sku: item.SKUInfo.SKU}, function(err, dbItem) {
      if (err) {
        console.log(err);
      } else if (dbItem) {
        // do some updates
        dbItem.usPrice = newPrice;
        dbItem.canPrice = newPrice * 1.10;
        dbItem.updated = true;
        dbItem.save();

        if (dbItem.hasOptions) { // update the options too
          Item.find({catalogId: dbItem.catalogId, isOption: true}, function(err, options) {
            if (err) {
              console.log(err);
            } else {
              options.forEach(function(option) {
                option.usPrice = newPrice;
                option.canPrice = newPrice * 1.10;
                option.updated = true;
                option.save();
              });
            }
          });
        }
      } else {
        console.log('Item not found.');
      }
    });
	});

	cartItems = itemsToSend; // if we send the raw object we end up wiping the advanced options

	var numOfRequests = Math.ceil(cartItems.length / 100);
	console.log('We need to send ' + numOfRequests + ' requests to 3D Cart - updating');

	var options = {
    url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
    method: 'PUT',
    headers : {
      SecureUrl : 'https://www.ecstasycrafts.com',
      PrivateKey : process.env.CART_PRIVATE_KEY,
      Token : process.env.CART_TOKEN
    },
    body: cartItems,
    json: true
  };

  var requests = [];

  for (var i = 0; i < numOfRequests; i++) {
  	var requestBody = cartItems.slice(i*100, (i+1)*100);

  	// US
  	options.headers.SecureUrl = 'https://www.ecstasycrafts.com';
  	options.headers.Token = process.env.CART_TOKEN;
  	options.body = requestBody;
  	requests.push(JSON.parse(JSON.stringify(options)));

  	// Canadian
  	options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
  	options.headers.Token = process.env.CART_TOKEN_CANADA;
  	requestBody.forEach(function(item) {
      var cad = item.SKUInfo.Canadian;
      item.SKUInfo.Price = cad;
      item.SKUInfo.RetailPrice = cad;
  		item.PriceLevel1 = cad;
      item.PriceLevel2 = (cad / 2).toFixed(2);
      item.PriceLevel7 = (cad / 2).toFixed(2);
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
      //GTIN: item.barcode,
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

    return Promise.all([usSave, canSave]).then(responses => {
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
    await saveItem(item, qbws, true);
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
        console.log(message);
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
      ShipmentFirstName: customer.firstname,
      ShipmentLastName: customer.lastname,
      ShipmentAddress: customer.shippingAddress,
      ShipmentCity: customer.shippingCity,
      ShipmentState: customer.shippingState,
      ShipmentCountry: customer.shippingCountry,
      ShipmentZipCode: customer.shippingZipCode,
      ShipmentPhone: customer.phone
    }],
    OrderItemList: [],
    OrderStatusID: 1 // NEW
  };
  return cartOrder;
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

module.exports = {
 	getItems: getItems,
  refreshFrom3DCart: refreshFrom3DCart,
 	saveItems: saveItems, // for inventory
 	saveOptionItems: saveOptionItems,
 	saveAdvancedOptions: saveAdvancedOptions,
 	getOrders: getOrders,
 	getItemsFull: getItemsFull,
 	updateItems: updateItems,
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
}