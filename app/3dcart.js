var secureUrlUs = 'https://www.ecstasycrafts.com';
var secureUrlCa = 'https://www.ecstasycrafts.ca';

/**
 * This will be a helper class for doing the common functions involving 3D Cart
 */
 var request = require('request');
 var async = require('async');
 var Item = require('./model/item');
 var Order = require('./model/order');
 var Settings = require('./model/settings');
 var Customer = require('./model/customer');
 var Receipt = require('./model/receipt');
 var helpers = require('./helpers');
 var pixl = require('pixl-xml')

/**
 * Refreshes the inventory in our DB so we know what to use in quickbooks
 */
function refreshFrom3DCart(finalCallback) {
  // get all the items from the US store
  function refreshUS(callback) {
    console.log('Getting all items from the US store.');
    getItemsFull({}, function(progress, total) {
      console.log('US: ' + ((progress/total)*100).toFixed(2) + '%');
    }, function(err) {
      callback(err)
    });
  }
  
  // At the same time, get the items from the canadian store
  function refreshCA(callback) {
    console.log('Getting all items from the CA store.');
    getItemsFull({canadian:true}, function(progress, total) {
        console.log('CA: ' + ((progress/total)*100).toFixed(2) + '%');
      }, function(err) {
        callback(err);
    });
  }

  async.parallel([refreshUS, refreshCA], function(err) {
    finalCallback(err);
  });
}

function updateItemsFromSKUInfo(item, skuInfo, canadian) {
  item.name = skuInfo.Name;
  item.isOption = false;
  item.updated = false;
  if (canadian == true) {
    item.catalogIdCan = skuInfo.CatalogID;
    item.canPrice = skuInfo.Price;
    item.canStock = skuInfo.Stock;
  } else {
    item.catalogId = skuInfo.CatalogID;
    item.usPrice = skuInfo.Price;
    item.usStock = skuInfo.Stock;
  }
  item.save();
}

/**
 * Gets items from 3D cart and saves them to the db
 */
function getItems(qbws, notifyCallback, finalCallback) {
  var usProgress = 0;
  var canProgress = 0;

 	// Get the product list from US 3D Cart first
  function usUpdate(callback) {
    getItemsQuick(false, function(progress, total, items) {
      usProgress = progress;
      notifyCallback(usProgress + canProgress, total*2);

      items.forEach(function(skuInfo) {
        var sku = skuInfo.SKU.trim();
        Item.findOne({sku: sku}, function(err, item) {
          if (err) {
            console.log('error!');
          } else {
            if (item) {
              updateItemsFromSKUInfo(item, skuInfo, false);
            } else {
              var newItem = new Item();
              newItem.sku = sku;
              updateItemsFromSKUInfo(newItem, skuInfo, false);
            }
          }
        });
      });
    }, function(err) {
      callback(null);
    });
  }

  // Get product list from Canadian website
  function canUpdate(callback) {
    getItemsQuick(true, function(progress, total, items) {
      canProgress = progress;
      notifyCallback(usProgress + canProgress, total*2);

      items.forEach(function(skuInfo) {
        var sku = skuInfo.SKU.trim();
        Item.findOne({sku: sku}, function(err, item) {
          if (err) {
            console.log('error!');
          } else {
            if (item) {
              updateItemsFromSKUInfo(item, skuInfo, true);
            } else {
              var newItem = new Item();
              newItem.sku = sku;
              updateItemsFromSKUInfo(newItem, skuInfo, true);
            }
          }
        });
      });
    }, function(err) {
      callback(null);
    });
  }

  async.parallel([usUpdate, canUpdate], function(err) {
    // Query all the items in our database (including the options)
    helpers.queryAllItems(qbws, function() {
      finalCallback();
    });
  });
}

function getItemsQuick(canadian, notifyCallback, finalCallback) {
  var options = {
    url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/skuinfo',
    headers : {
      SecureUrl : secureUrlUs,
      PrivateKey : process.env.CART_PRIVATE_KEY,
      Token : process.env.CART_TOKEN
    },
    qs: {
      countonly: 1
    }
  }

  if (canadian == true) {
    options.headers.SecureUrl = secureUrlCa;
    options.headers.Token = process.env.CART_TOKEN_CANADA;
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
    async.eachLimit(requests, 2, function(option, callback) {
      function doRequest() {
        request(option, function(err, response, body) {
          if (err) {
            callback(err);
          } else {
            callback(null);
          }
          counter++;
          notifyCallback(counter, numOfRequests, JSON.parse(body));
        });
      }
      setTimeout(doRequest, 1000);
    }, function (err) {
      if (err) {
        console.log(err);
      } else {
        finalCallback();
      }
    });
  });
}

/**
 * Takes the current state of the db and saves it to 3D Cart.
 */ 
function quickSaveItems(query, progressCallback, finalCallback) {
  var options = {
    url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
    method: 'PUT',
    headers : {
      SecureUrl : 'https://www.ecstasycrafts.com',
      PrivateKey : process.env.CART_PRIVATE_KEY,
      Token : process.env.CART_TOKEN
    },
    json : true
  };

  var canadian = false;

  if (query.canadian == true) {
    options.headers.SecureUrl = secureUrlCa;
    canadian = true;
    options.headers.Token = process.env.CART_TOKEN_CANADA;
  }
  delete query.canadian;

  console.log(query);

  Item.find(query, function(err, items) {
    if (err) {
      console.log(err);
    } else {
      var body = [];
      items.forEach(function(item) {
        body.push(buildCartItem(item, canadian));
      });

      var numOfRequests = Math.ceil(items.length / 100); // can only update 100 items at a time
      console.log('We need to send ' + numOfRequests + ' requests.');
      var requests = [];
      for (var i = 0; i < numOfRequests; i++) {
        options.body = body.slice(i*100, (i+1)*100);
        requests.push(JSON.parse(JSON.stringify(options)));
      }

      var counter = 0;
      async.mapLimit(requests, 2, function(option, callback) {
        function doRequest() {
          request(option, function(err, response, body) {
            if (err) {
              callback(err);
            } else {
              callback(null, body);
              body.forEach(function(response) {
                if (response.Status != '200') {
                  console.log(response);
                }
              });
              progressCallback(++counter, numOfRequests);
            }
          });
        };
        setTimeout(doRequest, 1000);
      }, function(err, responses) {
        var merged = [].concat.apply([], responses);
        finalCallback(merged);
      });
    }
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
  } else if (item.inactive && item.hasOptions) {
    cartItem.SKUInfo.Stock = 1;
  }

  var control = 3;
  if (item.usStock > 0)
    cartItem.InventoryControl = control;

  return cartItem;
}

function saveItems(query, progressCallback, finalCallback) {
  if (query == null || query == undefined) {
    query = {
      isOption: false,
      updated: true
    };
  }

  var usProgress = 0;
  var canProgress = 0;

  function saveUSSite(callback) {
    quickSaveItems(query, function(progress, total) {
      console.log('US SAVE: ' + ((progress/total)*100).toFixed() + '%');
      usProgress = progress;
      progressCallback(canProgress+usProgress, total*2);
    }, function(responses) {
      callback(null);
    });
  };

  function saveCanSite(callback) {
    query.canadian = true;
    quickSaveItems(query, function(progress, total) {
      console.log('CAN SAVE: ' + ((progress/total)*100).toFixed() + '%');
      canProgress = progress;
      progressCallback(canProgress+usProgress, total*2);
    }, function(responses) {
      callback(null);
    });
  };

  async.parallel([saveUSSite, saveCanSite], function(err) {
    finalCallback([]);
  });
}

/**
 * Takes the current state of the db (for items that are options and that are updated)
 * and saves it to 3D Cart.
 */
function saveOptionItems(progressCallback, finalCallback) {
  Item.find({isOption: true, inactive: false, updated: true}, function(err, items) {
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
      }

      items.forEach(function(item) {
        options.headers.SecureUrl = 'https://www.ecstasycrafts.com';
        options.headers.Token = process.env.CART_TOKEN;
        options.body = {
          AdvancedOptionStock: item.usStock,
          AdvancedOptionSufix: item.sku
        }
        var url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+
          item.catalogId+'/AdvancedOptions/'+item.optionId;
        options.url = url;
        requests.push(JSON.parse(JSON.stringify(options)));

        // now for the canadian site
        options.headers.SecureUrl = 'https://www.ecstasycrafts.ca';
        options.headers.Token = process.env.CART_TOKEN_CANADA;
        options.body = {
          AdvancedOptionStock: item.canStock,
          AdvancedOptionSufix: item.sku
        };
        url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+
          item.catalogIdCan+'/AdvancedOptions/'+item.optionIdCan;
        options.url = url;
        requests.push(JSON.parse(JSON.stringify(options)));
      });

      var total = requests.length;
      var counter = 0;

      async.mapLimit(requests, 4, function(option, callback) {
        function doRequest() {
          request(option, function(err, response, body) {
            if (err) {
              callback(err);
            } else {
              callback(null, body);
              counter++;
              if (Array.isArray(body)) {
                body.forEach(function(response) {
                  if (response.Status != '200') {
                    console.log(response);
                    console.log(option.url);
                    console.log(option.headers.SecureUrl);
                  }
                });
              } else {
                if (body.Status != '200') {
                  console.log(response);
                }
              }
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

/**
 * Just get the order information
 */
function getOrdersFull(query, callback) {
  query.countonly = 1;

  var options = {
    url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Orders',
    headers : {
      SecureUrl : 'https://www.ecstasycrafts.com',
      PrivateKey : process.env.CART_PRIVATE_KEY,
      Token : process.env.CART_TOKEN
    },
    qs : query
  };

  request(options, function(err, response, body) {
    console.log(body);
  });
}

/**
 * For importing orders into quickbooks
 */

function getOrdersQuick(query, qbws, progressCallback, finalCallback) {
  var canadian = false;

  helpers.setTimeCode();
  Settings.findOne({}, function(err, settings) {
    if (settings) {
      settings.lastImport = helpers.getTimeCode();
      settings.save();
    } else {
      var newSettings = new Settings();
      newSettings.lastImport = helpers.getTimeCode();
      newSettings.save();
    }
  });

  query.countonly = 1;

  var options = {
    url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Orders',
    headers: {
      SecureUrl: secureUrlUs,
      PrivateKey: process.env.CART_PRIVATE_KEY,
      Token: process.env.CART_TOKEN
    },
    qs: query
  };

  if (query.canadian == true) {
    canadian = true;
    options.headers.SecureUrl = secureUrlCa;
    options.headers.Token = process.env.CART_TOKEN_CANADA;
  }
  delete query.canadian;

  console.log(query);

  request(options, function(err, response, body) {
    delete query.countonly;
    var numberOfOrders = JSON.parse(body).TotalCount;
    console.log(numberOfOrders);
    var numOfRequests = Math.ceil(numberOfOrders / 200); // can always get 200 records
    var requests = [];

    if (canadian) {
      console.log('Canada');
    } else {
      console.log('US');
    }
    console.log('We need to do ' + numOfRequests + ' requests to get all the orders');

    if (numOfRequests == 0) {
      finalCallback();
    } else {
      for (var i = 0; i < numOfRequests; i++) {
        query.offset = i * query.limit;
        options.qs = query;
        requests.push(JSON.parse(JSON.stringify(options)));
      }

      var counter = 0;
      async.eachLimit(requests, 2, function(option, callback) {
        function doRequest() {
          request(option, function(err, response, body) {
            progressCallback(++counter, numOfRequests);
            createOrdersInDB(JSON.parse(body), function() {
              console.log('finsihed saving the orders');
              callback(null);
            });
          });
        }
        setTimeout(doRequest, 1000);
      }, function(err) {
        finalCallback();
      });
    }
  });
}

function getOrders(query, qbws, callback) {
  function usOrders(cb) {
    getOrdersQuick(query, qbws, function(progress, total, orders) {
      console.log('US: ' + ((progress/total)*100).toFixed() + '%');
    }, function() {
      // finished
      cb();
    });
  }

  function canOrders(cb) {
    query.canadian = true;
    getOrdersQuick(query, qbws, function(progress, total, orders) {
      console.log('CA: ' + ((progress/total)*100).toFixed() + '%');
    }, function() {
      // finished
      cb();
    });
  }

  async.parallel([usOrders, canOrders], function() {
    // all orders now should be in the {imported: false} state if
    // they need to be imported
    helpers.createInvoices(qbws);
    Order.find({imported: false}, function(err, orders) {
      callback(orders.length);
    });
  });
}

function createOrdersInDB(orders, callback) {
  // build requests and save this to the database
  var operations = [];
  var contacts = [];
  orders.forEach(function(order) {
    contacts.push(helpers.getCustomer(order)); // hubspot integration
    var orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;

    operations.push(function(cb) {
      Order.findOne({orderId: orderId}, function(err, dbOrder) {
        if (err) {
          console.log(err);
        } else {
          if (dbOrder) {
            // We already have this order in the db.
            dbOrder.retry = true;
            updateOrderInfo(dbOrder, order, cb);
          } else {
            // create the order in our database
            var newOrder = new Order();
            newOrder.orderId = orderId;
            newOrder.imported = false;
            newOrder.retry = false;
            updateOrderInfo(newOrder, order, cb);
          }
        }
      });
    });
  });

  async.parallel(operations, function(err) {
    // Hubspot update
    helpers.updateContacts(contacts, function(message) {
      console.log('Hubspot Response:')
      if (message) {
        console.log(message.statusCode);
        if (message.statusCode == 400) {
          console.log(message);
        }
      }
    });
    callback();
  });
}

function updateOrderInfo(order, cartOrder, callback) {
  order.name = cartOrder.BillingFirstName + ' ' + cartOrder.BillingLastName;
  order.cartOrder = cartOrder;
  order.timecode = helpers.getTimeCode();
  order.canadian = cartOrder.InvoiceNumberPrefix == 'CA-';
  var itemList = [];
  if (cartOrder.OrderItemList) {
    cartOrder.OrderItemList.forEach(function(item) {
      // TODO
      var sku = item.ItemID.trim();
      var findingItem = Item.findOne({sku: sku});
      findingItem.then(function(doc) {
        doc.lastOrderDate = new Date(cartOrder.OrderDate);
        doc.save();
      });
    });
  } else {
    console.log(cartOrder);
  }
  
  order.save(function(err, savedOrder) {
    updateCustomerInfo(savedOrder, cartOrder);
    callback();
  });
}

function updateCustomerInfo(order, cartOrder) {
  var email = cartOrder.BillingEmail;
  Customer.findOne({email: email}, function(err, customer) {
    if (err) {
      console.log(err);
    } else {
      if (customer) {
        updateCustomer(customer, order, cartOrder);
      } else {
        var newCustomer = new Customer();
        newCustomer.email = email;
        updateCustomer(newCustomer, order, cartOrder);
      }
    }
  });
}

function updateCustomer(customer, order, cartOrder) {
  customer.firstname = cartOrder.BillingFirstName;
  customer.lastname = cartOrder.BillingLastName;
  customer.lastOrderDate = new Date(cartOrder.OrderDate);
  var contestStart = new Date();
  contestStart.setFullYear(2017, 8, 29);
  var contestEnd = new Date();
  contestEnd.setFullYear(2017, 9, 2);
  if (customer.lastOrderDate > contestStart && customer.lastOrderDate < contestEnd) {
    customer.contestEntries++;
  }
  customer.orders.push(order._id);
  customer.save();
}

function getSalesReceipts(qbws) {
	var salesReceiptRq = helpers.querySalesReceiptRq('2017-08-10', '2017-08-11');
	qbws.addRequest(salesReceiptRq);
	qbws.setCallback(function(response, qbws, continueFunction) {
		var doc = pixl.parse(response);
    var salesRs = doc.QBXMLMsgsRs.SalesReceiptQueryRs;

    if (salesRs) {
    	var receipts = salesRs.SalesReceiptRet;

    	receipts.forEach(function(receipt) {
    		Receipt.findOne({id: receipt.RefNumber}, function(err, dbReceipt) {
    			if (err) {
    				console.log(err);
    			} else {
    				if (dbReceipt) {
    					dbReceipt.qbObj = receipt;
    					dbReceipt.save();
    				} else {
    					var newReceipt = new Receipt();
    					newReceipt.id = receipt.RefNumber;
    					newReceipt.qbObj = receipt;
    					newReceipt.save();
    				}
    				console.log(receipt.RefNumber);
    			}
    		});
    	});
    }
	});
  continueFunction();
}

function addSalesReceipts(qbws) {
	Receipt.find({}, function(err, receipts) {
		if (err) {
			console.log(err);
		} else {
			receipts.forEach(function(receipt) {
				var addSalesReceipts = {
					SalesReceiptAddRq: {
						SalesReceiptAdd: {}
					}
				};

				var salesAdd = {
					TxnDate: receipt.qbObj.TxnDate,
					RefNumber: receipt.qbObj.RefNumber,
					SalesReceiptLineAdd: []
				};

				if (receipt.qbObj.SalesReceiptLineRet instanceof Array) {
					receipt.qbObj.SalesReceiptLineRet.forEach(function(lineItem) {
						if (lineItem.ItemRef) {
							salesAdd.SalesReceiptLineAdd.push({
								ItemRef: {
									FullName: lineItem.ItemRef.FullName
								},
								Quantity: lineItem.Quantity,
								Amount: lineItem.Amount
							});
						}
					});
				} else {
					var lineItem = receipt.qbObj.SalesReceiptLineRet;
					salesAdd.SalesReceiptLineAdd.push({
						ItemRef: {
							FullName: lineItem.ItemRef.FullName
						},
						Quantity: lineItem.Quantity,
						Amount: lineItem.Amount
					});
				}

				addSalesReceipts.SalesReceiptAddRq.SalesReceiptAdd = salesAdd;

				var xmlDoc = helpers.getXMLRequest(addSalesReceipts);
				var str = xmlDoc.end({pretty:true});
				console.log(str);
				qbws.addRequest(str);
			});
		}
	});
}

function getItemsFull(query, progressCallback, finalCallback) {
	query.countonly = 1;
  var canadian = false;
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

  var options = {
    url: url,
    method: 'GET',
    headers : {
      SecureUrl : 'https://www.ecstasycrafts.com',
      PrivateKey : process.env.CART_PRIVATE_KEY,
      Token : process.env.CART_TOKEN
    }
  };

  if (query.canadian != 'undefined' && query.canadian == true) {
    options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
    options.headers.Token = process.env.CART_TOKEN_CANADA;
    canadian = true;
  }
  delete query.canadian;

  options.qs = query;

  request(options, function(err, response, body) {
  	if (!body) {
  		console.log('No items found');
      console.log(response);
  		finalCallback([]);
  	} else {
	  	var responseObject = JSON.parse(body);
	  	console.log(responseObject);
	  	var totalItems = responseObject.TotalCount;
	  	// can only get 200 items back per request
	  	var numOfRequests = Math.ceil(totalItems / 200);
	  	console.log('We need to send ' + numOfRequests + ' requests to 3D Cart.');

	  	var requests = [];

	  	for (var i = 0; i < numOfRequests; i++) {
	  		options.qs.countonly = 0;
        options.qs.offset = i * 200;
	  		options.qs.limit = 200;
	  		requests.push(JSON.parse(JSON.stringify(options)));
	  	}
      var counter = 0;

	  	async.eachLimit(requests, 2, function(option, callback) {
        function doRequest() {
          request(option, function(err, response, body) {
            if (err) {
              callback(err);
            } else {
              var items = JSON.parse(body);
              progressCallback(++counter, numOfRequests, items);
              items.forEach(function(cartItem) {
                var sku = cartItem.SKUInfo.SKU.trim();
                Item.findOne({sku: sku}, function(err, item) {
                  if (err) {
                    console.log(err);
                  } else {
                    if (item) { // do some updates
                      updateItemFields(item, cartItem, canadian);
                    } else {
                      var newItem = new Item();
                      newItem.sku = sku;
                      updateItemFields(newItem, cartItem, canadian);
                    }
                  }
                });
              });
              callback(null);
            }
          });
        }
        setTimeout(doRequest, 1000);
	  	}, function(err) {
	  		finalCallback(err);
	  	});
  	}
  });
}

function updateItemFields(item, cartItem, canadian) {
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

  if (item.ExtraField8 != '' && item.ExtraField8 != undefined) {
    item.barcode = item.ExtraField8;
  }

  if (canadian) {
    item.canPrice = cartItem.SKUInfo.Price;
    item.catalogIdCan = cartItem.SKUInfo.CatalogID;
    item.canLink = cartItem.ProductLink;
    item.canStock = cartItem.SKUInfo.Stock;
  }
  else {
    item.usPrice = cartItem.SKUInfo.Price;
    item.catalogId = cartItem.SKUInfo.CatalogID;
    item.usLink = cartItem.ProductLink;
    item.manufacturerId = cartItem.ManufacturerID;
    item.usStock = cartItem.SKUInfo.Stock;
  }

  if (cartItem.AdvancedOptionList.length > 0) {
    item.hasOptions = true;
    // save the options
    cartItem.AdvancedOptionList.forEach(function(optionItem) {
      var optionSKU = optionItem.AdvancedOptionSufix.trim();
      Item.findOne({sku: optionSKU}, function(err, advancedOption) {
        if (err) {
          console.log(err);
        } else {
          if (advancedOption) {
            updateAdvancedOptionFields(advancedOption, cartItem, optionItem, canadian);
          } else if (optionItem.AdvancedOptionSufix != '') {
            var newOption = new Item();
            newOption.sku = optionSKU;
            updateAdvancedOptionFields(newOption, cartItem, optionItem, canadian);
          }
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
  
  /*
  cartItem.FeatureList.forEach(function(feature) {
    if (feature.FeatureTitle == 'Size' || 
        feature.FeatureTitle == 'size' ||
        feature.FeatureTitle == 'Size:' ||
        feature.FeatureTitle == 'size:') {
      var size = feature.FeatureDescription;
      var tempSize = size;
      if (tempSize.indexOf('Largest') > -1) {
        tempSize = tempSize.substring(tempSize.indexOf('Largest'));
      }

      item.size = size;
      tempSize = tempSize.replace(/[a-w]|[yz]|:|"| /gi, '');
      var middle = tempSize.indexOf('x');
      var width = tempSize.substring(0, middle);
      var length = tempSize.substring(middle + 1);

      item.width = width;
      item.length = length;
    }
  });
  */
  
  item.save();
}

function updateAdvancedOptionFields(advancedOption, cartItem, optionItem, canadian) {
  advancedOption.name = optionItem.AdvancedOptionName;
  if (canadian) {
    advancedOption.optionIdCan = optionItem.AdvancedOptionCode;
    advancedOption.catalogIdCan = cartItem.SKUInfo.CatalogID; // Parent Item
    advancedOption.canPrice = optionItem.AdvancedOptionPrice;
    advancedOption.canLink = cartItem.ProductLink;
    advancedOption.canStock = optionItem.AdvancedOptionStock;
  }
  else {
    advancedOption.usPrice = optionItem.AdvancedOptionPrice;
    advancedOption.catalogId = cartItem.SKUInfo.CatalogID; // Parent Item
    advancedOption.optionId = optionItem.AdvancedOptionCode;
    advancedOption.usLink = cartItem.ProductLink;
    advancedOption.usStock = optionItem.AdvancedOptionStock;
  }

  advancedOption.isOption = true;
  advancedOption.save();
}

/**
 * toFixed() has some rounding issues
 */
function updateItems(cartItems, bulkUpdates, progressCallback, finalCallback) {
	var itemsToSend = [];
	cartItems.forEach(function(item) {
		// apply bulk updates
		if (bulkUpdates.priceIncrease) {
			var percentIncrease = (bulkUpdates.priceIncrease / 100) + 1;
			var originalPrice = item.SKUInfo.Price
			var newPrice = (originalPrice * percentIncrease).toFixed(2);

			console.log(newPrice);

      item.SKUInfo.Price = newPrice;
			item.SKUInfo.RetailPrice = newPrice;
			item.PriceLevel2 = (newPrice / 2).toFixed(2); // U.S. Wholesale
			item.PriceLevel7 = (newPrice / 2).toFixed(2); // Canadian Wholesale
			item.SKUInfo.Canadian = newPrice * 1.10; // Canadian Markup
		}

		if (bulkUpdates.onSale) {
			item.SKUInfo.OnSale = bulkUpdates.onSale;
		}

		var newItem = {
			SKUInfo: item.SKUInfo,
			PriceLevel2: item.PriceLevel2,
			PriceLevel7: item.PriceLevel7
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
function updateQuickbooks(qbws, callback) {
  Item.find({}, function(err, items) {
    if (err) {
      console.log(err);
    } else {
      console.log('Modifying ' + items.length + ' items in quickbooks.');
  
      items.forEach(function(item) {
        helpers.saveToQuickbooks(item, qbws);
      });

      callback();
    }
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

function saveItem(item, qbws) {
  helpers.saveItem(item, qbws);

  if (!item.isOption) {
    // save to us website
    var options = {
      url: 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products',
      method: 'PUT',
      headers : {
        SecureUrl : 'https://www.ecstasycrafts.com',
        PrivateKey : process.env.CART_PRIVATE_KEY,
        Token : process.env.CART_TOKEN
      }
    };

    var control = 3;

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
      PriceLevel2: (item.usPrice/2).toFixed(2),
      PriceLevel7: (item.usPrice/2).toFixed(2),
      MFGID: item.sku,
      WarehouseLocation: item.location,
      GTIN: item.barcode,
      ExtraField8: item.barcode,
      ExtraField9: item.countryOfOrigin,
      InventoryControl: control,
      Hide: item.hidden,

    }];

    if (item.inactive == true) {
      body[0].SKUInfo.Stock = 0;
    }

    options.body = body;
    options.json = true;

    request(options, function(err, response, body) {
      console.log('US Site:');
      console.log(body);
    });

    // save to canadian site
    options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
    options.headers.Token = process.env.CART_TOKEN_CANADA;
    options.body[0].SKUInfo.Price = item.canPrice;
    options.body[0].SKUInfo.RetailPrice = item.canPrice;
    options.body[0].SKUInfo.SalePrice = item.canSalePrice;
    options.body[0].SKUInfo.Stock = item.canStock;
    options.body[0].PriceLevel1 = item.canPrice;
    options.body[0].PriceLevel2 = (item.canPrice/2).toFixed(2);
    options.body[0].PriceLevel7 = (item.canPrice/2).toFixed(2);

    if (item.canStock > 0) {
      options.body[0].InventoryControl = 3;
    }

    request(options, function(err, response, body) {
      console.log('CAN Site:');
      console.log(body);
    });
  } else {
    // save the option
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

    options.body = {
      AdvancedOptionStock: item.usStock,
      AdvancedOptionSufix: item.sku,
      AdvancedOptionPrice: item.usPrice,
      AdvancedOptionName: item.name
    }

    var url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+item.catalogId+'/AdvancedOptions/'+item.optionId;
    options.url = url;

    request(options, function(err, response, body) {
      console.log('US Site:')
      console.log(body);
    });

    options.url = 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+item.catalogIdCan+'/AdvancedOptions/'+item.optionIdCan;
    options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
    options.headers.Token = process.env.CART_TOKEN_CANADA;
    options.body.AdvancedOptionPrice = item.canPrice;
    options.body.AdvancedOptionStock = item.canStock;

    request(options, function(err, response, body) {
      console.log('CAN Site:');
      console.log(body);
    });
  }
}

module.exports = {
 	getItems: getItems,
  refreshFrom3DCart: refreshFrom3DCart,
 	saveItems: saveItems, // for inventory
 	saveOptionItems: saveOptionItems,
 	saveAdvancedOptions: saveAdvancedOptions,
 	getOrders: getOrders,
 	getSalesReceipts: getSalesReceipts,
 	addSalesReceipts: addSalesReceipts,
 	getItemsFull: getItemsFull,
 	updateItems: updateItems,
  updateQuickbooks: updateQuickbooks,
  getCategories: getCategories,
  updateItemsFromDB: updateItemsFromDB,
  saveCategories: updateCategories,
  saveItem: saveItem
}