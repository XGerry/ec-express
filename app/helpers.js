/**
 * Generic helper class
 */

var builder = require('xmlbuilder');
var request = require('request');
var Order = require('./model/order');
var Settings = require('./model/settings');
var Item = require('./model/item');
var async = require('async');
var xmlParser = require('xml2js').parseString; 
var pixl = require('pixl-xml')

var timecode = + new Date();

function getTimeCode() {
  return timecode;
}

function setTimeCode() {
  timecode = +new Date();
}

function getXMLRequest(request) {
  var xmlDoc = builder.create('QBXML', { version: '1.0', encoding: 'ISO-8859-1'})
  .instructionBefore('qbxml', 'version="13.0"')
  .ele('QBXMLMsgsRq', { 'onError': 'continueOnError' });
  xmlDoc.ele(request);
  return xmlDoc;
}

function getXMLDoc(doc) {
  var xmlDoc = builder.create(doc);
  return xmlDoc.end({pretty: true});
}

function createShippingAddress(order) {
  var shippingAddress = {};
  shippingAddress.Addr1 = order.ShipmentList[0].ShipmentFirstName + " " + order.ShipmentList[0].ShipmentLastName;
  shippingAddress.Addr2 = order.ShipmentList[0].ShipmentCompany;
  shippingAddress.Addr3 = order.ShipmentList[0].ShipmentAddress;
  shippingAddress.Addr4 = order.ShipmentList[0].ShipmentAddress2;
  shippingAddress.City = order.ShipmentList[0].ShipmentCity;
  shippingAddress.State = order.ShipmentList[0].ShipmentState;
  shippingAddress.PostalCode = order.ShipmentList[0].ShipmentZipCode;
  shippingAddress.Country = order.ShipmentList[0].ShipmentCountry;
  return shippingAddress;
}

function addCustomerRq(order, requestID) {
  console.log('Creating customer ' + order.BillingFirstName);

  // figure out what tax code they will get based on their billing address
  var shippingAddress = createShippingAddress(order);
  var taxCode = 'NON';
  if (shippingAddress.Country == 'CA') {
    if (shippingAddress.State == 'ON' || 
      shippingAddress.State == 'NL' || 
      shippingAddress.State == 'NB') {
      taxCode = 'H';
    } else if (shippingAddress.State == 'AB' ||
      shippingAddress.State == 'SK' ||
      shippingAddress.State == 'QC' ||
      shippingAddress.State == 'BC' ||
      shippingAddress.State == 'YT' ||
      shippingAddress.State == 'NU' ||
      shippingAddress.State == 'NT' ||
      shippingAddress.State == 'MB') {
      taxCode = 'G';
    } else if (shippingAddress.State == 'NS') {
      taxCode = 'NS';
    } else if (shippingAddress.State == 'PE') {
      taxCode = 'PEI';
    }
  }

  var obj = {
    CustomerAddRq : {
      '@requestID' : requestID,
      CustomerAdd : {
        Name : order.BillingLastName + ' ' + order.BillingFirstName,
        CompanyName : order.BillingCompany,
        FirstName : order.BillingFirstName,
        LastName : order.BillingLastName,
        BillAddress : {
          Addr1 : order.BillingLastName + ' ' + order.BillingFirstName,
          Addr2 : order.BillingCompany,
          Addr3 : order.BillingAddress,
          Addr4 : order.BillingAddress2,
          City : order.BillingCity,
          State : order.BillingState,
          PostalCode : order.BillingZipCode,
          Country : order.BillingCountry
        },
        ShipAddress : shippingAddress,
        Phone : order.BillingPhoneNumber,
        Email : order.BillingEmail,
        SalesTaxCodeRef : {
          FullName : taxCode
        }
      }
    }
  }

  var xmlDoc = getXMLRequest(obj);
  var str = xmlDoc.end({'pretty' : true});
  return str;
}

function queryItemRq(items, limit) {
  // build an array of all the item names we want the information on
  var itemNames = [];
  if (items) {
    items.forEach(function(item) {
      if (item.ItemRef) {
        var itemName = item.ItemRef.FullName;
        if (itemName && (!itemName.includes('Shipping') || 
          !itemName.includes('Subtotal') || 
          !itemName.includes('Surcharge') ||
          !itemName.includes('DISC'))) {
          itemNames.push(item.ItemRef.FullName);
        }
      } else if (item.SKUInfo) {
          itemNames.push(item.SKUInfo.SKU);
      }
    });   
  }

  var qbRq = {
    ItemInventoryQueryRq : {
      '@requestID' : 'itemRequest'
    }
  };

  if (itemNames.length > 0) {
    qbRq.ItemInventoryQueryRq.FullName = itemNames
  }

  if (limit) {
    qbRq.ItemInventoryQueryRq.MaxReturned = limit;
  }

  qbRq.ItemInventoryQueryRq.OwnerID = 0;

  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({'pretty' : true});
  return str;
}

function modifyInventoryRq(item) {
  var qbRq = {
    InventoryAdjustmentAddRq : {
      InventoryAdjustmentAdd: {
        AccountRef: {
          FullName: 'inventory changes'
        },
        Memo: 'Updated through EC-Express',
        InventoryAdjustmentLineAdd: {
          ItemRef: {
            FullName: item.sku
          },
          QuantityAdjustment: {
            NewQuantity: item.stock
          }
        }
      }
    }
  };

  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({'pretty': true});
  return str;
}

function getMultipleItemsRq(items) {
  var qbRq = {
    ItemInventoryQueryRq : {
      '@requestID' : 'itemRequest'
    }
  };

  var names = [];
  items.forEach(function(item) {
    names.push(item.sku);
  });

  qbRq.ItemInventoryQueryRq.FullName = names;
  //qbRq.ItemInventoryQueryRq.ActiveStatus = 'ALL';
  qbRq.ItemInventoryQueryRq.OwnerID = 0;

  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({'pretty' : true});
  return str;
}

function getItemRq(item) {
  var qbRq = {
    ItemInventoryQueryRq : {
      '@requestID' : 'itemRequest-'+item.sku
    }
  };

  qbRq.ItemInventoryQueryRq.FullName = item.sku;
  //qbRq.ItemInventoryQueryRq.ActiveStatus = 'ALL';
  qbRq.ItemInventoryQueryRq.OwnerID = 0;

  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({'pretty' : true});
  return str;
}

// Item is a DB item
function modifyItemRq(item) {
  // can only do this one at a time
  var modRq = {
    ListID: item.listId,
    EditSequence: item.editSequence,
    IsActive: !item.inactive,
    SalesPrice: item.usPrice
  };

  var qbRq = {
    ItemInventoryModRq: {
      '@requestID': 'itemModify-'+item.listId,
      ItemInventoryMod : modRq
    }
  };

  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({'pretty': true});
  return str;
}

/**
 * orders are 3d cart orders
 */
function queryInvoiceRq(orders) {
  var orderNumbers = [];
  orders.forEach(function(order) {
    orderNumbers.push(order.InvoiceNumberPrefix + order.InvoiceNumber);
  });

  var invoiceQuery = {
    InvoiceQueryRq : {
      '@requestID' : 'invoiceCheck',
      RefNumber : orderNumbers
    }
  };
  
  var xmlDoc = getXMLRequest(invoiceQuery);
  var str = xmlDoc.end({'pretty': true});
  return str;
}

/**
 * orders are db orders
 */
function getInvoiceRq(orders) {
  var orderNumbers = [];
  orders.forEach(function(order) {
    orderNumbers.push(order.orderId);
  });

  var invoiceQuery = {
    InvoiceQueryRq : {
      '@requestID' : 'invoiceCheck',
      RefNumber : orderNumbers
    }
  };

  var xmlDoc = getXMLRequest(invoiceQuery);
  var str = xmlDoc.end({'pretty': true});
  return str;
}

function querySalesReceiptRq(start, end) {
  var salesReceiptQuery = {
    SalesReceiptQueryRq: {
      '@requestID': 'salesQuery',
      TxnDateRangeFilter: {
        FromTxnDate: start,
        ToTxnDate: end
      },
      IncludeLineItems: true
    }
  };

  var xmlDoc = getXMLRequest(salesReceiptQuery);
  var str = xmlDoc.end({pretty:true});
  return str;
}

function addInvoiceRq(order, requestID) {
  console.log('Creating invoice for ' + order.BillingFirstName + ' ' + order.BillingLastName);

  // generate the json object for the line orders
  var invoiceAdds = [];
  order.OrderItemList.forEach(function (item) {
    invoiceAdds.push({
      ItemRef : {
        FullName : item.ItemID
      },
      Quantity : item.ItemQuantity,
      Rate : item.ItemUnitPrice
    });
  });

  // look for any discounts in the order
  order.PromotionList.forEach(function (item) {
    invoiceAdds.push({
      ItemRef : {
        FullName : "DISC"
      },
      Desc : item.PromotionName,
      Rate: item.DiscountAmount
    });
  });  

  // add the shipping cost as a line item
  invoiceAdds.push({
    ItemRef : {
      FullName : "Shipping & Handling"
    },
    Rate : order.ShipmentList[0].ShipmentCost
  });

  // we need to add a surcharge if they are a Canadian customer (only when coming from the US website)
  if (order.InvoiceNumberPrefix == 'AB-') {
    var country = order.BillingCountry;
    if (country === "CA" || country === "Canada") {
      invoiceAdds.push({
        ItemRef : {
          FullName : "Subtotal"
        }
      });
      invoiceAdds.push({
        ItemRef : {
          FullName : "Surcharge"
        },
        Quantity : 10
      });
    }
  }
  
  var shippingMethod = order.ShipmentList[0].ShipmentMethodName.slice(0,15); // max 15 characters
  shippingMethod = (shippingMethod !== '') ? shippingMethod : 'cheapest way'; // default for now

  var paymentMethod3DCart = order.BillingPaymentMethod;
  var paymentMethod = 'Online Credit Card';
  if (paymentMethod3DCart.includes('card is on file')) {
    paymentMethod = 'On Account';
  } else if (paymentMethod3DCart.includes('PayPal')) {
    paymentMethod = 'PayPal';
  } else if (paymentMethod3DCart.includes('Check or Money Order')) {
    paymentMethod = 'cheque';
  } else if (paymentMethod3DCart.includes('On Account')) {
    paymentMethod = 'On Account';
  }

  var obj = {
    InvoiceAddRq : {
      '@requestID' : requestID,
      InvoiceAdd : {
        CustomerRef : {
          FullName : order.BillingLastName + ' ' + order.BillingFirstName 
        },
        TxnDate : order.OrderDate.slice(0,10), // had to remove the T from the DateTime - maybe this is dangerous?
        RefNumber : order.InvoiceNumberPrefix + order.InvoiceNumber,
        ShipAddress : createShippingAddress(order),
        TermsRef : {
          FullName : paymentMethod
        },
        ShipMethodRef : {
          FullName : shippingMethod
        },
        Memo : order.CustomerComments + ' - API Import ('+timecode+')',
        IsToBePrinted : true,
        InvoiceLineAdd : invoiceAdds
      }
    }
  };
  var xmlDoc = getXMLRequest(obj);
  var str = xmlDoc.end({'pretty' : true});
  return str;
}

function buildAmazonXML(orders) {
  var obj = '';
}

function addProperty(propertyName, value) {
  var prop = {
    "property" : propertyName,
    "value" : value
  };
  return prop;
}

/**
 * For hubspot integration
 */
function getCustomerFromOrder(order) {
  var customer = {
    email : order.BillingEmail,
    properties : []
  };

  customer.properties.push(addProperty('firstname', order.BillingFirstName));
  customer.properties.push(addProperty('lastname', order.BillingLastName));
  customer.properties.push(addProperty('country', order.BillingCountry));
  customer.properties.push(addProperty('company', order.BillingCompany));
  var orderDate = new Date(order.OrderDate);
  var utcDate = Date.UTC(orderDate.getUTCFullYear(), orderDate.getUTCMonth(), orderDate.getUTCDate());
  customer.properties.push(addProperty('last_order_date', utcDate));

  return customer;
}

function getProducts(options, callback) {
  var products = getProductsRequest(options, 0, callback);
}

function getProductsRequest(options, count, callback) {
  var products = [];
  request.get(options, function(err, response, body) {
    if (err) {
      console.log('Error: ' + body);
      return products;
    }

    var productArray = JSON.parse(body);
    products = products.concat(productArray);

    if (productArray.length > 0 && productArray[0].Key != 'Error') { // we still have items to get
      options.qs.offset += productArray.length;
      console.log('retrieved ' + productArray.length + ' products from 3D cart.');
      if (count > 50) {
        products.concat(setTimeout(getProductsRequest(options, count++), 2000));
      } else {
        products.concat(getProductsRequest(options, count++));
      }
    } else {
      callback(products);
    }
  });
}

function updateContacts(contacts, callback) {
  var options = {
    url: 'https://api.hubapi.com/contacts/v1/contact/batch/',
    body: contacts,
    json: true,
    qs: {
      hapikey: process.env.HAPI_KEY,
    }
  };

  request.post(options, function(error, response, body) {
    callback(response);
  });
}

function updateOrders(orders, callback, canadian) {
  // send the orders to 3D cart
  var usOrders, canOrders = [];

  var numOfRequests = Math.ceil(orders.length / 100); // can only update 100 orders at a time
  console.log('We need to send ' + numOfRequests + ' requests to update all the orders.');
  var requests = [];

  var options = {
    url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Orders',
    headers : {
      SecureUrl : 'https://www.ecstasycrafts.com',
      PrivateKey : process.env.CART_PRIVATE_KEY,
      Token : process.env.CART_TOKEN
    },
    body : orders,
    json : true
  };

  if (canadian) {
    options.headers.SecureUrl = 'https://ecstasycrafts-ca.3dcartstores.com';
    options.headers.Token = process.env.CART_TOKEN_CANADA;
  }

  for (var i = 0; i < numOfRequests; i++) {
    options.body = orders.slice(i*100, (i+1)*100);
    requests.push(JSON.parse(JSON.stringify(options)));
  }

  var counter = 0;
  async.mapSeries(requests, function(option, callbackAsync) {
    request.put(option, function(err, response, body) {
      callbackAsync(err, body);
    });
  }, function(err, body) {
    var merged = [].concat.apply([], body);
    callback(err, merged);
  });
}

function markCompletedOrdersAsProcessing(timecode, callback) {
  Order.find({imported: true, canadian: false, timecode: timecode}, function (err, docs) {
    if (err) {
      console.log('Error getting the results');
    } else {
      var orders = setOrderAsProcessing(docs);
      updateOrders(orders, function(err, results) {
        Order.find({imported: true, canadian: true, timecode: timecode}, function(err, docs) {
          if (err) {
            console.log(err);
          } else {
            var orders = setOrderAsProcessing(docs);
            updateOrders(orders, function(err, canResults) {
              var merged = results.concat(canResults);
              callback(err, merged);
            }, true)
          }
        });
      }, false);
    }
  });
}

function setOrderAsProcessing(docs) {
  var orders = [];
  docs.forEach(function (doc) {
    var order = {};
    order.OrderID = doc.cartOrder.OrderID;
    order.ShipmentList = doc.cartOrder.ShipmentList;
    order.OrderStatusID = 2; // processing
    order.ShipmentList[0].ShipmentOrderStatus = 2; // processing
    order.InternalComments = "This order was automatically updated by EC-Express";
    orders.push(order);
  });

  console.log('updating ' + orders.length + ' orders.');
  return orders;
}

function addItemForManifest(lineItem, doc, itemArray) {
  if (lineItem.ItemRef && lineItem.ItemRef.FullName) {
    var item = {
      htcCode : '',
      countryOfOrigin : '',
      quantity : +lineItem.Quantity,
      amount : +lineItem.Amount
    }

    doc.items.forEach(function(itemDoc) { // maybe don't use forEach here
      if (lineItem.ItemRef && lineItem.ItemRef.FullName == itemDoc.FullName) {
        if (itemDoc.DataExtRet) {
          if (itemDoc.DataExtRet instanceof Array) {
            itemDoc.DataExtRet.forEach(function(customField) {
              if (customField.DataExtName == 'C Origin') {
                item.countryOfOrigin = customField.DataExtValue;
              } else if (customField.DataExtName == 'HTC Code') {
                item.htcCode = customField.DataExtValue;
              }
            });
            item.name = itemDoc.FullName;
            itemArray.push(item);
          } else {
            var customField = itemDoc.DataExtRet;
            if (customField.DataExtName == 'C Origin') {
              item.countryOfOrigin = customField.DataExtValue;
            } else if (customField.DataExtName == 'HTC Code') {
              item.htcCode = customField.DataExtValue;
            }
            item.name = itemDoc.FullName;
            itemArray.push(item);
          }
        }
      }

      if (item.countryOfOrigin == '') {
        item.countryOfOrigin = 'CHINA';
      }

      item.countryOfOrigin = item.countryOfOrigin.toUpperCase();
    });
  }
}

function isCanadian(address) {
  return (address.State == 'ON' || 
    address.State == 'NL' || 
    address.State == 'NB' ||
    address.State == 'AB' ||
    address.State == 'SK' ||
    address.State == 'QC' ||
    address.State == 'BC' ||
    address.State == 'YT' ||
    address.State == 'NU' ||
    address.State == 'NT' ||
    address.State == 'MB' ||
    address.State == 'NS' ||
    address.State == 'PE');
}

function safePrint(value) {
  if (value) {
    return value;
  } else {
    return '';
  }
}

/**
 * orders are a 3D cart order
 */
function createInvoices(qbws) {
  // first request is a check to see if there are duplicate invoices
  Order.find({imported: false}, function(err, orders) {
    if (err) {
      console.log(err);
    } else if (orders.length != 0) {
      var invoiceRq = getInvoiceRq(orders);
      console.log(invoiceRq);
      qbws.addRequest(invoiceRq);
      qbws.setCallback(function(response, returnObject, responseCallback) {
        var doc = pixl.parse(response);
        var invoiceRs = doc.QBXMLMsgsRs.InvoiceQueryRs;
        var operations = [];

        if (invoiceRs) {
          if (invoiceRs.requestID == 'invoiceCheck') {
            if (Array.isArray(invoiceRs.InvoiceRet)) {
              invoiceRs.InvoiceRet.forEach(function(invoice) {
                operations.push(function(cb) {
                  updateDuplicateOrder(invoice, function() {
                    cb();
                  });
                });
              });
            } else {
              var invoice = invoiceRs.InvoiceRet;
              if (invoice != null || invoice != undefined) {
                operations.push(function(cb) {
                  updateDuplicateOrder(invoice, function() {
                    cb();
                  });
                });
              }
            }

            async.parallel(operations, function() {
              // now all the orders should only contain the ones we want to import
              console.log('calling generate order request');
              qbws.generateOrderRequest(returnObject, responseCallback);
            });
          }
        } else {
          responseCallback({returnObject}); // default
        }
      });
    }
  });
}

function updateDuplicateOrder(invoice, callback) {
  Order.findOne({orderId: invoice.RefNumber}, function(err, order) {
    if (err) {
      console.log(err);
    } else {
      // duplicate order
      order.imported = true; // already imported
      order.message = 'Duplicate order. Skipping.';
      order.save(function(err) {
        callback();
      });
    }
  });
}

function inventorySyncCallback(response, returnObject, responseCallback) {
  var operations = [];
  Settings.findOne({}, function(err, settings) {
    xmlParser(response, {explicitArray: false}, function(err, result) {
      var itemInventoryRs = result.QBXML.QBXMLMsgsRs.ItemInventoryQueryRs;
      if (itemInventoryRs) {
        if (Array.isArray(itemInventoryRs.ItemInventoryRet)) {
          itemInventoryRs.ItemInventoryRet.forEach(function(qbItem) {
            operations.push(function(callback) {
              findItemAndSave(settings, qbItem, callback);
            });
          });
          console.log('Array.');
        } else {
          operations.push(function(callback) {
            findItemAndSave(settings, itemInventoryRs.ItemInventoryRet, callback);  
          });
          console.log('Single Item.');
        }
        async.series(operations, function(err) {
          if (err) {
            console.log('An error occurred saving the items');
            console.log(err);
          } else {
            console.log('Saved all items successfully.');
          }
        });
      } else {
        console.log('Not an inventory response');
        console.log(result.QBXML);
        responseCallback(returnObject);
      }
    });
  });
}

function findItemAndSave(settings, qbItem, callback) {
  if (qbItem) {
    Item.findOne({sku: qbItem.FullName}, function(err, item) {
      if (err) {
        console.log('Error finding the item');
        console.log(err.message);
        console.log(qbItem.FullName);
      } else {
        if (!item) {
          console.log('Unable to find item ' + qbItem.FullName);
          callback();
        }
        else {
          saveItemFromQB(settings, item, qbItem, callback);
        }
      }
    });
  }
}

function saveItemFromQB(settings, item, qbItem, callback) {
  var usStock = (qbItem.QuantityOnHand * settings.usDistribution).toFixed();
  var canStock = (qbItem.QuantityOnHand * settings.canadianDistribution).toFixed();
  
  if ((item.stock != qbItem.QuantityOnHand) || 
    (item.usStock != usStock) ||
    (item.canStock != canStock)) {
    item.stock = qbItem.QuantityOnHand
    item.usStock = usStock;
    item.canStock = canStock;
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

  if (qbItem.IsActive == false || qbItem.IsActive == 'false') {
    if (item.inactive == false || item.inactive == null) {
      item.updated = true;
    }
    item.inactive = true;
  } else {
    if (item.inactive == true || item.inactive == null) {
      item.updated = true;
    }
    item.inactive = false;
  }
  item.save(function(err) {
    if (err) {
      callback(err);
    } else {
      callback();
    }
  });
}

function addItemProperties(data, item) {
  if (data.DataExtName == 'barcode' || data.DataExtName == 'Barcode') {
    if (item.barcode != data.DataExtValue) {
      item.barcode = data.DataExtValue;
    }
  } else if (data.DataExtName == 'Location') {
    if (item.location != data.DataExtValue) {
      item.location = data.DataExtValue;
    }
  } else if (data.DataExtName == 'Country') {
    if (item.countryOfOrigin != data.DataExtValue) {
      item.countryOfOrigin = data.DataExtValue;
    }
  }
}

function search(query, callback) {
  Item.find(query, callback);
}

function saveItem(item, qbws) {
  // save the item in our db
  Item.findOne({sku: item.sku}, function(err, theItem) {
    if (err) {
      console.log(err);
    } else if (theItem) {
      // update the fields
      theItem.name = item.name;
      theItem.usPrice = item.usPrice;
      theItem.canPrice = item.canPrice;
      theItem.stock = item.stock;
      theItem.usStock = item.usStock;
      theItem.canStock = item.canStock;
      theItem.location = item.location;
      theItem.barcode = item.barcode;
      theItem.countryOfOrigin = item.countryOfOrigin;
      theItem.isOption = item.isOption;
      theItem.hasOptions = item.hasOptions;
      theItem.inactive = item.inactive;
      theItem.hidden = item.hidden;
      theItem.onSale = item.onSale;
      theItem.usSalePrice = item.usSalePrice;
      theItem.canSalePrice = item.canSalePrice;
      theItem.save();

      saveToQuickbooks(theItem, qbws, function(savedItem) {
        console.log('\nadding inventory request\n');
        qbws.addRequest(modifyInventoryRq(savedItem));
      });
    }
  });
}

function saveToQuickbooks(item, qbws, callback) {
  getItemInQuickbooks(item, qbws, function(savedItem, inventoryResponse, continueFunction) {
    console.log('\nadding modify item request\n');
    qbws.addRequest(modifyItemRq(savedItem));
    continueFunction();
    callback(savedItem);
  });
}

/**
 * Gets the item from Quickbooks, updates the necessary information. Then
 * provides a callback function which takes the savedItem and the item from QB.
 */
function getItemInQuickbooks(item, qbws, callback) {
  // create request in qb
  console.log('\nADDING GET ITEM REQUEST\n');
  qbws.addRequest(getItemRq(item));
  qbws.addCallback(function(response, continueFunction) {
    xmlParser(response, {explicitArray: false}, function(err, result) {
      var itemInventoryRs = result.QBXML.QBXMLMsgsRs.ItemInventoryQueryRs;
      if (itemInventoryRs) {
        if (itemInventoryRs.$.requestID == 'itemRequest-'+item.sku) {
          console.log('\ngot the item request\n');
          item.editSequence = itemInventoryRs.ItemInventoryRet.EditSequence;
          item.listId = itemInventoryRs.ItemInventoryRet.ListID;
          item.save(function(err, savedItem) {
            callback(savedItem, itemInventoryRs.ItemInventoryRet, continueFunction);
          });
        } else {
          continueFunction();
        }
      } else {
        continueFunction();
      }
    });
  });
}

/**
 * This is all the items and the options
 */
function queryAllItems(qbws, callback) {
  Item.find({}, function(err, items) {
    if (err) {
      console.log(err);
    } else {
      qbws.addRequest(getMultipleItemsRq(items));
      qbws.setCallback(inventorySyncCallback);
      items.forEach(function(item) {
        item.updated = false;
        item.save();
      });
      callback();
    }
  });
}

/**
 * Go through all the items in the database and clean up the fields and documents
 */
function cleanDatabase(callback) {
  Item.find({}, function(err, items) {
    if (err) {
      console.log(err);
    } else {
      items.forEach(function(item) {
        item.usPrice = item.usPrice.toFixed(2);
        item.canPrice = item.canPrice.toFixed(2);
        var name = item.name.toLowerCase();
        name = name.replace(/(^|\s)[a-z]/g, function(f) {
          return f.toUpperCase();
        });
        item.name = name;
        item.barcode = item.barcode.replace(/a/gi, '');
        item.save();
      });
    }
  });
}

module.exports = {
  getXMLRequest : getXMLRequest,
  getXMLDoc: getXMLDoc,
  createShippingAddress : createShippingAddress,
  addCustomerRq : addCustomerRq,
  addInvoiceRq : addInvoiceRq,
  getCustomer : getCustomerFromOrder,
  getProducts : getProducts,
  updateContacts : updateContacts,
  updateOrders : updateOrders,
  markCompletedOrdersAsProcessing : markCompletedOrdersAsProcessing,
  queryItemRq : queryItemRq,
  addItemForManifest : addItemForManifest,
  isCanadian : isCanadian,
  safePrint: safePrint,
  getTimeCode: getTimeCode,
  setTimeCode: setTimeCode,
  queryInvoiceRq: queryInvoiceRq,
  querySalesReceiptRq: querySalesReceiptRq,
  modifyItemRq: modifyItemRq,
  inventorySyncCallback: inventorySyncCallback,
  search: search,
  saveItem: saveItem,
  saveToQuickbooks: saveToQuickbooks,
  queryAllItems: queryAllItems,
  getItemRq: getItemRq,
  getItemInQuickbooks: getItemInQuickbooks,
  createInvoices: createInvoices
}