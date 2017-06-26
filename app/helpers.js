var builder = require('xmlbuilder');
var request = require('request');
var Order = require('./model/order');

var timecode = + new Date();

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
      }
    });   
  }

  var qbRq = {
    ItemInventoryQueryRq : {
      '@requestID' : 'itemRequest',
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

  // we need to add a surcharge if they are a Canadian customer
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
  
  var cottonCandy = false;
  order.OrderItemList.forEach(function (item) {
    if (item.ItemID == 'ECProj01') { // this means they ordered the Cotton Candy Essentials Pack
      cottonCandy = true;
    }
  });

  customer.properties.push(addProperty('purchased_cotton_candy', cottonCandy));
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
    url : 'https://api.hubapi.com/contacts/v1/contact/batch/?hapikey='+ process.env.HAPI_KEY,
    body : contacts,
    json : true
  };

  request.post(options, function(error, response, body) {
    callback(body);
  });
}

function updateOrders(orders, callback) {
  // send the orders to 3D cart
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

  request.put(options, callback);
}

function markCompletedOrdersAsProcessing(callback) {
  Order.find({imported: true}, function (err, docs) {
    if (err) {
      console.log('Error getting the results');
    } else {
      var orders = [];
      docs.forEach(function (doc) {
        var order = doc.cartOrder;
        order.OrderStatusID = 2; // processing
        order.ShipmentList[0].ShipmentOrderStatus = 2; // processing
        order.InternalComments = "This order was automatically updated by EC-Express";
        orders.push(order);
      });

      console.log('updating ' + orders.length + ' orders.');
      updateOrders(orders, callback);
    }
  });
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
  timecode: timecode,
  queryInvoiceRq: queryInvoiceRq
}