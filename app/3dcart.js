/**
 * This will be a helper class for doing the common functions involving 3D Cart
 */
 var request = require('request');
 var async = require('async');
 var Item = require('./model/item');
 var Order = require('./model/order');
 var Receipt = require('./model/receipt');
 var helpers = require('./helpers');
 var pixl = require('pixl-xml')

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
      countonly: 1,
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
              //item.updated = false;
              item.catalogId = skuInfo.CatalogID;
              item.isOption = false;
              item.save();
            } else {
              var newItem = new Item();
              newItem.sku = sku;
              newItem.name = skuInfo.Name;
              newItem.stock = skuInfo.Stock;
              newItem.usPrice = skuInfo.Price;
              //newItem.updated = false;
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
function saveItems(query, progressCallback, finalCallback) {
  Item.find({updated: true, isOption: false}, function(err, items) {
    console.log('There are ' + items.length + ' items that need inventory synced.');
    var body = [];
    var numOfRequests = Math.ceil(items.length / 100); // can only update 100 items at a time
    console.log('We need to send ' + numOfRequests + ' requests.');
    items.forEach(function(item) {
      var cartItem = {
        SKUInfo: {
          SKU: item.sku,
          Stock: item.usStock,
          CatalogID: item.catalogId,
          CanadaStock: item.canStock
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

      // also update the canadian store
      options.body.forEach(function(item) {
        item.SKUInfo.Stock = item.SKUInfo.CanadaStock;
      });
      options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
      options.headers.Token = process.env.CART_TOKEN_CANADA;
      
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
          progressCallback(counter, numOfRequests*2);
        }
      });
    }, function(err, responses) {
      var merged = [].concat.apply([], responses);
      finalCallback(merged);
    });
  });
}

function testAPICall(id, callback) {
	var options = {
    url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Products/'+id+'/AdvancedOptions',
    headers : {
      SecureUrl : 'https://www.ecstasycrafts.com',
      PrivateKey : process.env.CART_PRIVATE_KEY,
      Token : process.env.CART_TOKEN
    },
    qs: {
    	limit: 200
    }
  };

  request(options, function(err, response, body) {
  	console.log(response);
  	callback(body);
  });
}

/**
 * Takes the current state of the db (for items that are options)
 * and saves it to 3D Cart.
 */
function saveOptionItems(progressCallback, finalCallback) {
  Item.find({isOption: true, inactive: false}, function(err, items) {
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
          AdvancedOptionStock: item.stock,
          AdvancedOptionSufix: item.sku
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
  	request(req, function(err, response, body) {
  		if (err)
  			callback(err);
  		else 
  			callback(null, body);
  	});
  }, function(err, responses) {
		console.log('done');
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

function getOrders(query, qbws, callback) {
  // clear the requests in qbws
  qbws.clearRequests();

  // remove the orders (i guess this is the best way to do this for now)
  Order.remove({}, finishedDelete);

  function finishedDelete() {
    // set a new timecode
    helpers.timecode = + new Date();

    var options = {
      url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Orders',
      headers : {
        SecureUrl : 'https://www.ecstasycrafts.com',
        PrivateKey : process.env.CART_PRIVATE_KEY,
        Token : process.env.CART_TOKEN
      },
      qs : query
    };

    var requests = [];
    requests.push(JSON.parse(JSON.stringify(options)));

    options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
    options.headers.Token = process.env.CART_TOKEN_CANADA;

    requests.push(JSON.parse(JSON.stringify(options)));

    async.map(requests, function(option, asyncCallback) {
      request.get(option, function (error, response, body) {
        if (error) {
          asyncCallback(err);
        } else {
          if (body)
            asyncCallback(null, JSON.parse(body));
          else
            asyncCallback(null, []);
        }
      });
    }, function(err, bodies) {
      var merged = [].concat.apply([], bodies);
      createInvoices(merged);
    });

    function createInvoices(orders) {
      var jsonBody = orders;
      var contacts = [];

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
                  savedOrder.imported = true;
                  savedOrder.save();
                });
              });
            } else {
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
      jsonBody.forEach(function(order) {
        qbws.addOrder(order);

        contacts.push(helpers.getCustomer(order)); // hubspot integration
        var orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;

        Order.findOne({orderId: orderId}, function(err, dbOrder) {
          if (err) {
            console.log(err);
          } else {
            if (dbOrder) {
              // We already have this order in the db. So we must be retrying it for some reason
              dbOrder.cartOrder = order;
              dbOrder.name = order.BillingFirstName + ' ' + order.BillingLastName;
              dbOrder.timecode = helpers.timecode;
              dbOrder.retry = true;
              dbOrder.canadian = order.InvoiceNumberPrefix == 'CA-';
              dbOrder.save();
            } else {
              // create the order in our database
              var newOrder = new Order();
              newOrder.cartOrder = order;
              newOrder.name = order.BillingFirstName + ' ' + order.BillingLastName;
              newOrder.orderId = order.InvoiceNumberPrefix + order.InvoiceNumber;
              newOrder.imported = false;
              newOrder.timecode = helpers.timecode;
              newOrder.retry = false;
              newOrder.canadian = order.InvoiceNumberPrefix == 'CA-';
              newOrder.save();
            }
          }
        });
      });

      helpers.updateContacts(contacts, function(message) {
        console.log('Hubspot Response:')
        console.log(message.statusCode);
      });
      
      callback(jsonBody);
    }
  }
}

function getSalesReceipts(qbws) {
	var salesReceiptRq = helpers.querySalesReceiptRq('2017-08-10', '2017-08-11');
	qbws.addRequest(salesReceiptRq);
	qbws.setCallback(function(response) {
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

function getItemsFull(query, finalCallback) {
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
  
  console.log(url);
  console.log(options.headers.SecureUrl);
	console.log(query);

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

	  	async.mapSeries(requests, function(option, callback) {
	  		request(option, function(err, response, body) {
	  			if (err) {
	  				callback(err);
	  			} else {
	  				callback(null, JSON.parse(body));
	  				console.log('Received Response');
	  			}
	  		});
	  	}, function(err, responses) {
	  		var merged = [].concat.apply([], responses);

	  		merged.forEach(function(cartItem) {
	  			Item.findOne({sku:cartItem.SKUInfo.SKU}, function(err, item) {
	  				if (err) {
	  					console.log(err);
	  				} else {
	  					if (item) { // do some updates
	  						updateItemFields(item, cartItem, canadian);
	  					} else {
	  						var newItem = new Item();
                newItem.sku = cartItem.SKUInfo.SKU;
                updateItemFields(newItem, cartItem, canadian);
	  					}
	  				}
	  			});
	  		});

	  		finalCallback(merged);
	  	});
  	}
  });
}

function updateItemFields(item, cartItem, canadian) {
  item.onSale = cartItem.SKUInfo.OnSale;
  if (canadian)
    item.canPrice = cartItem.SKUInfo.Price;
  else 
    item.usPrice = cartItem.SKUInfo.Price;

  if (cartItem.AdvancedOptionList.length > 0) {
    item.hasOptions = true;
    // save the options
    cartItem.AdvancedOptionList.forEach(function(optionItem) {
      Item.findOne({sku:optionItem.AdvancedOptionSufix}, function(err, advancedOption) {
        if (err) {
          console.log(err);
        } else {
          if (advancedOption) {
            advancedOption.name = optionItem.AdvancedOptionName;
            if (canadian) {
              advancedOption.optionIdCan = optionItem.AdvancedOptionCode;
              advancedOption.canPrice = optionItem.AdvancedOptionPrice;
            }
            else {
              advancedOption.usPrice = optionItem.AdvancedOptionPrice;
              advancedOption.optionId = optionItem.AdvancedOptionCode;
            }
            advancedOption.stock = optionItem.AdvancedOptionStock;
            advancedOption.isOption = true;
            advancedOption.save();
          } else {
            var newOption = new Item();
            newOption.sku = optionItem.AdvancedOptionSufix;
            newOption.name = optionItem.AdvancedOptionName;
            if (canadian) {
              newOption.optionIdCan = optionItem.AdvancedOptionCode;
              newOption.canPrice = optionItem.AdvancedOptionPrice;
            }
            else {
              newOption.usPrice = optionItem.AdvancedOptionPrice;
              newOption.optionId = optionItem.AdvancedOptionCode;
            }
            newOption.stock = optionItem.AdvancedOptionStock;
            newOption.isOption = true;
            newOption.save();
          }
        }
      });
    });
  }
  item.save();
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
 */
function updateQuickbooks(qbws, callback) {
  Item.find({updated: true}, function(err, items) {
    if (err) {
      console.log(err);
    } else {
      console.log('Modifying ' + items.length + ' items in quickbooks.');
  
      items.forEach(function(item) {
        qbws.addRequest(helpers.modifyItemRq(item));
        //item.updated = false; // we saved the request
        //item.save();
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

    setTimeout(doRequest, 1000);
  }, function(err, responses) {
    console.log(responses);
    finalCallback(responses);
  });
}

module.exports = {
 	getItems: getItems,
 	saveItems: saveItems, // for inventory
 	saveOptionItems: saveOptionItems,
 	saveAdvancedOptions: saveAdvancedOptions,
 	getOrders: getOrders,
 	getSalesReceipts: getSalesReceipts,
 	addSalesReceipts: addSalesReceipts,
 	getItemsFull: getItemsFull,
 	updateItems: updateItems,
 	testAPICall: testAPICall,
  updateQuickbooks: updateQuickbooks,
  getCategories: getCategories,
  updateItemsFromDB: updateItemsFromDB,
  saveCategories: updateCategories
}