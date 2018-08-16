/**
 * Generic helper class
 */

var builder = require('xmlbuilder');
var request = require('request');
var rp = require('request-promise-native');
var Order = require('./model/order');
var Settings = require('./model/settings');
var Manifest = require('./model/manifest');
var Customer = require('./model/customer');
var Item = require('./model/item');
var Address = require('./model/address');
var PO = require('./model/purchaseOrder');
var Delivery = require('./model/delivery');
var async = require('async');
var xmlParser = require('xml2js').parseString; 
var xml2js = require('xml2js-es6-promise');
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
  var xmlDoc = builder.create(doc, {encoding: 'utf-8'});
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

function createBillingAddress(order) {
  var billingAddress = {};
  billingAddress.Addr1 = order.BillingFirstName + " " + order.BillingLastName;
  billingAddress.Addr2 = order.BillingCompany;
  billingAddress.Addr3 = order.BillingAddress;
  billingAddress.Addr4 = order.BillingAddress2;
  billingAddress.City = order.BillingCity;
  billingAddress.State = order.BillingState;
  billingAddress.PostalCode = order.BillingZipCode;
  billingAddress.Country = order.BillingCountry;
  return billingAddress;
}

function addCustomerRq(order, requestID) {
  console.log('Creating customer ' + order.BillingFirstName + ' ' + order.BillingLastName);

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

  var customerType = 'US '; // default
  if (order.BillingCountry == 'CA') {
    customerType = 'Canada ';
  }

  if (order.BillingCompany && order.BillingCompany != '') {
    customerType += 'Wholesale';
  } else {
    customerType += 'Retail';
  }

  // var customerName = order.BillingLastName + ' ' + order.BillingFirstName;
  // if (order.BillingCompany && order.BillingCompany != '') {
  //   customerName = order.BillingCompany;
  // }

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
        CustomerTypeRef: {
          FullName: customerType
        },
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
        InventorySiteRef: {
          FullName: 'Warehouse'
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

function modifyItemsInventoryRq(items, memo) {
  var qbRq = {
    InventoryAdjustmentAddRq : {
      InventoryAdjustmentAdd: {
        AccountRef: {
          FullName: 'inventory changes'
        },
        InventorySiteRef: {
          FullName: 'Warehouse'
        },
        Memo: memo,
        InventoryAdjustmentLineAdd: []
      }
    }
  };

  items.forEach(item => {
    var itemLineAdd = {
      ItemRef: {
        FullName: item.sku
      },
      QuantityAdjustment: {
        NewQuantity: item.newStock
      }
    };

    qbRq.InventoryAdjustmentAddRq.InventoryAdjustmentAdd.InventoryAdjustmentLineAdd.push(itemLineAdd);
  });
  
  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({pretty: true});
  return str;  
}

function getMultipleItemsRq(items, id, retElements) {
  var requestID = 'itemRequest';
  if (id) {
    requestID += '-' + id;
  }
  var qbRq = {
    ItemInventoryQueryRq : {
      '@requestID' : requestID
    }
  };

  var names = [];
  items.forEach(function(item) {
    names.push(item.sku);
  });

  qbRq.ItemInventoryQueryRq.FullName = names;
  //qbRq.ItemInventoryQueryRq.ActiveStatus = 'ALL';
  if (retElements) {
    qbRq.ItemInventoryQueryRq.IncludeRetElement = retElements;
  } else {
    qbRq.ItemInventoryQueryRq.IncludeRetElement = [
      'ListID',
      'EditSequence',
      'Name',
      'FullName',
      'BarCodeValue',
      'IsActive',
      'QuantityOnHand',
      'QuantityOnSalesOrder',
      'DataExtRet'
    ];
  }
  qbRq.ItemInventoryQueryRq.OwnerID = 0;

  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({'pretty' : true});
  return str;
}

function getMultipleItemAssemblyRq(items) {
  var qbRq = {
    ItemInventoryAssemblyQueryRq: {
      '@requestID': 'itemAssemblyRequest'
    }
  };

  var names = [];
  items.forEach((item) => {
    names.push(item.sku);
  });

  qbRq.ItemInventoryAssemblyQueryRq.FullName = names;
  qbRq.ItemInventoryAssemblyQueryRq.IncludeRetElement = [
    'ListID',
    'EditSequence',
    'Name',
    'FullName',
    'BarCodeValue',
    'IsActive',
    'QuantityOnHand',
    'DataExtRet'
  ];
  qbRq.ItemInventoryAssemblyQueryRq.OwnerID = 0; // order matters

  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({pretty: true});
  return str;
}

function getItemAssemblyRq(item) {
  var qbRq = {
    ItemInventoryAssemblyQueryRq: {
      '@requestID': 'itemAssemblyRq-'+item.sku,
      FullName: item.sku,
      OwnerID: 0
    }
  };

  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({pretty: true});
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

function createItemRq(item) {
  var qbRq = {
    ItemInventoryAddRq: {
      ItemInventoryAdd: {
        Name: item.id,
        BarCode: {
          BarCodeValue: item.gtin,
          AssignEvenIfUsed: true,
          AllowOverride: true
        },
        SalesTaxCodeRef: {
          FullName: 'NON'
        },
        SalesDesc: item.name,
        SalesPrice: item.price.replace('$', ''),
        IncomeAccountRef: {
          FullName: 'Sales'
        },
        PurchaseDesc: item.name,
        PurchaseCost: item.cost.replace('$', ''),
        PurchaseTaxCodeRef: {
          FullName: 'NON'
        },
        COGSAccountRef: {
          FullName: 'Cost of Goods Sold'
        },
        //PrefVendorRef: {
        //  FullName: item.manufacturer
        //},
        AssetAccountRef: {
          FullName: 'Inventory Asset'
        }
      }
    }
  };

  if (item.gtin == undefined || item.gtin == '') {
    delete qbRq.ItemInventoryAddRq.ItemInventoryAdd.BarCode;
  }

  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({'pretty': true});
  console.log(str);
  return str;
}

// Item is a DB item
function modifyItemRq(item) {
  // can only do this one at a time
  var modRq = {
    ListID: item.listId,
    EditSequence: item.editSequence,
    BarCode: {
      BarCodeValue: item.barcode,
      AssignEvenIfUsed: true,
      AllowOverride: true
    },
    IsActive: !item.inactive,
    SalesPrice: item.usPrice,
  };

  var qbRq = {
    ItemInventoryModRq: {
      '@requestID': 'itemModify-'+item.listId,
      ItemInventoryMod : modRq
    }
  };

  var xmlDoc = getXMLRequest(qbRq);
  var str = xmlDoc.end({'pretty': true});
  console.log(str);
  return str;
}

function modifyCustomField(fieldName, value, listId) {
  var modRq = {
    OwnerID: 0,
    DataExtName: fieldName,
    ListDataExtType: 'Item',
    ListObjRef: {
      ListID: listId
    },
    DataExtValue: value
  };

  var qbRq = {
    DataExtModRq: {
      '@requestID': 'dataExtMod-'+listId,
      DataExtMod: modRq
    }
  }

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
  if (orders.length == 0) {
    orders.push({
      orderId: 'AB-12345'
    });
  }
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

function getSalesOrdersRq(orders, includeLineItems) {
  if (orders.length == 0) { // this prevents quickbooks returning all the sales orders
    orders.push({
      orderId: 'AB-12345'
    });
  }
  var orderIds = orders.map(o => o.orderId);
  var orderQuery = {
    SalesOrderQueryRq: {
      '@requestID': 'salesOrderCheck',
      RefNumber: orderIds,
      IncludeLineItems: includeLineItems
    }
  };

  var xmlDoc = getXMLRequest(orderQuery);
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

function addSalesOrderRq(order) {
  console.log('Creating sales order for ' + order.BillingFirstName + ' ' + order.BillingLastName);
  var invoiceAdds = [];
  order.OrderItemList.forEach(item => {
    invoiceAdds.push({
      ItemRef : {
        FullName : item.ItemID
      },
      Quantity : item.ItemQuantity,
      Rate : item.ItemUnitPrice,
      InventorySiteRef: {
        FullName: 'Warehouse'
      }
    });
  });

  // another place there could be a discount
  // let's just add all the discounts lumped into one line
  if (order.OrderDiscount > 0) {
    invoiceAdds.push({
      ItemRef : {
        FullName : "DISC"
      },
      Desc : 'All discounts on order',
      Rate: order.OrderDiscount
    });
  }

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

  var customerRef = order.BillingLastName + ' ' + order.BillingFirstName;
  // if (order.BillingCompany && order.BillingCompany != '') { // not doing this yet
  //   customerRef = order.BillingCompany;
  // }

  // find the PO number in the comments
  var commentArray = order.CustomerComments.split('\n');
  var comments = '';
  var po = '';
  commentArray.forEach(comment => {
    var code = comment.substring(0, 4);
    if (code == 'PO: ') {
      po = comment.substring(4);
    } else {
      comments += comment;
    }
  });

  // An exception for Amazon
  if (order.BillingFirstName == 'Amazon') {
    customerRef = 'Amazon';
  }

  var obj = {
    SalesOrderAddRq : {
      '@requestID' : order.InvoiceNumberPrefix + order.InvoiceNumber,
      SalesOrderAdd : {
        CustomerRef : {
          FullName : customerRef
        },
        TxnDate : order.OrderDate.slice(0,10), // had to remove the T from the DateTime - maybe this is dangerous?
        RefNumber : order.InvoiceNumberPrefix + order.InvoiceNumber,
        BillAddress: createBillingAddress(order),
        ShipAddress : createShippingAddress(order),
        PONumber: po,
        TermsRef : {
          FullName : paymentMethod
        },
        ShipMethodRef : {
          FullName : shippingMethod
        },
        Memo : comments + ' - API Import ('+timecode+')',
        IsToBePrinted : true,
        SalesOrderLineAdd : invoiceAdds
      }
    }
  };
  var xmlDoc = getXMLRequest(obj);
  var str = xmlDoc.end({'pretty' : true});
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
  // order.PromotionList.forEach(function (item) {
  //   invoiceAdds.push({
  //     ItemRef : {
  //       FullName : "DISC"
  //     },
  //     Desc : item.PromotionName,
  //     Rate: item.DiscountAmount
  //   });
  // });

  // another place there could be a discount
  // let's just add all the discounts lumped into one line
  if (order.OrderDiscount > 0) {
    invoiceAdds.push({
      ItemRef : {
        FullName : "DISC"
      },
      Desc : 'All discounts on order',
      Rate: order.OrderDiscount
    });
  }

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

  var customerRef = order.BillingLastName + ' ' + order.BillingFirstName;
  // if (order.BillingCompany && order.BillingCompany != '') { // not doing this yet
  //   customerRef = order.BillingCompany;
  // }

  // find the PO number in the comments
  var commentArray = order.CustomerComments.split('\n');
  var comments = '';
  var po = '';
  commentArray.forEach(comment => {
    var code = comment.substring(0, 4);
    if (code == 'PO: ') {
      po = comment.substring(4);
    } else {
      comments += comment;
    }
  });

  // An exception for Amazon
  if (order.BillingFirstName == 'Amazon') {
    customerRef = 'Amazon';
  }

  var obj = {
    InvoiceAddRq : {
      '@requestID' : requestID,
      InvoiceAdd : {
        CustomerRef : {
          FullName : customerRef
        },
        TxnDate : order.OrderDate.slice(0,10), // had to remove the T from the DateTime - maybe this is dangerous?
        RefNumber : order.InvoiceNumberPrefix + order.InvoiceNumber,
        BillAddress: createBillingAddress(order),
        ShipAddress : createShippingAddress(order),
        PONumber: po,
        TermsRef : {
          FullName : paymentMethod
        },
        ShipMethodRef : {
          FullName : shippingMethod
        },
        Memo : comments + ' - API Import ('+timecode+')',
        IsToBePrinted : true,
        InvoiceLineAdd : invoiceAdds
      }
    }
  };
  var xmlDoc = getXMLRequest(obj);
  var str = xmlDoc.end({'pretty' : true});
  return str;
}

function createInvoiceFromSalesOrder(qbws, order) {
  var orderId = order.InvoiceNumberPrefix+order.InvoiceNumber;
  console.log('adding sales order request');
  qbws.addRequest(getSalesOrdersRq([{orderId: orderId}], true), xmlResponse => {
    return xml2js(xmlResponse, {explicitArray: false}).then(responseObject => {
      var salesOrderRs = responseObject.QBXML.QBXMLMsgsRs.SalesOrderQueryRs;
      if (salesOrderRs == undefined) {
        console.log('Sales order not created yet!');
      } else if (salesOrderRs.SalesOrderRet) {
        var salesOrder = salesOrderRs.SalesOrderRet;
        console.log(salesOrder);
        var invoiceAdds = [];
        var quantityPickedMap = {};
        order.OrderItemList.forEach(i => {
          quantityPickedMap[i.ItemID] = i.quantityPicked;
        });

        salesOrder.SalesOrderLineRet.forEach(item => {
          invoiceAdds.push({
            Quantity: quantityPickedMap[item.ItemRef.FullName],
            //Rate: item.Rate,
            //ClassRef: '',
            //Amount: '',
            //InventorySiteRef: {
            //  FullName: 'Warehouse'
            //},
            SalesTaxCodeRef: item.SalesTaxCodeRef,
            LinkToTxn: {
              TxnID: salesOrder.TxnID,
              TxnLineID: item.TxnLineID
            }
          });
        });

        var addInvoiceRq = {
          InvoiceAddRq: {
            '@requestID': orderId,
            InvoiceAdd: {
              CustomerRef: {
                ListID: salesOrder.CustomerRef.ListID
              },
              RefNumber: salesOrder.RefNumber,
              //LinkToTxnID: salesOrder.TxnID,
              InvoiceLineAdd: invoiceAdds
            }
          }
        };

        var xmlDoc = getXMLRequest(addInvoiceRq);
        var str = xmlDoc.end({pretty: true});
        console.log(str);
        qbws.addRequest(str);
        return 'Done';
      } else {
        console.log('Error check the sales order');
      }
    });
  });
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

function markCompletedOrdersAsProcessing(timecodes, callback) {
  Order.find({imported: true, canadian: false, timecode: {$in: timecodes} }, function (err, usDocs) {
    if (err) {
      console.log('Error getting the results');
    } else {
      var orders = setOrderAsProcessing(usDocs);
      updateOrders(orders, function(err, results) {
        Order.find({imported: true, canadian: true, timecode: {$in: timecodes} }, function(err, canDocs) {
          if (err) {
            console.log(err);
          } else {
            var orders = setOrderAsProcessing(canDocs);
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
function createInvoiceRequests(qbws) {
  Order.find({imported: false}).then(orders => {
    var invoiceRq = getInvoiceRq(orders); //getInvoiceRq(orders);
    qbws.addRequest(invoiceRq, (response) => {
      var promises = [];
      return xml2js(response, {explicitArray: false}).then(responseObject => {
        var invoiceRs = responseObject.QBXML.QBXMLMsgsRs.InvoiceQueryRs;
        if (Array.isArray(invoiceRs.InvoiceRet)) {
          invoiceRs.InvoiceRet.forEach(invoice => {
            promises.push(updateDuplicateOrder(invoice));
          });
        } else if (invoiceRs.InvoiceRet) {
          promises.push(updateDuplicateOrder(invoiceRs.InvoiceRet));
        }

        return Promise.all(promises).then(() => {
          // now the duplicate orders have been purged
          return qbws.generateOrderRequest();
        });
      });
    });
  });
}

function createSalesOrdersRequests(qbws) {
  Order.find({imported: false}).then(orders => {
    var salesOrderRq = getSalesOrdersRq(orders, false);
    qbws.addRequest(salesOrderRq, response => {
      return xml2js(response, {explicitArray: false}).then(responseObject => {
        var salesOrderRs = responseObject.QBXML.QBXMLMsgsRs.SalesOrderQueryRs;
        var promises = [];
        if (Array.isArray(salesOrderRs.SalesOrderRet)) {
          salesOrderRs.SalesOrderRet.forEach(salesOrder => {
            promises.push(updateDuplicateOrder(salesOrderRq));
          });
        } else if (salesOrderRs.SalesOrderRet) {
          promises.push(updateDuplicateOrder(salesOrderRs.SalesOrderRet))
        }
        return Promise.all(promises).then(() => {
          return qbws.generateOrderRequest();
        });
      });
    });
  });
}

function updateDuplicateOrder(invoice) {
  return Order.findOne({orderId: invoice.RefNumber}, function(err, order) {
    if (order) {
      order.imported = true; // already imported
      order.message = 'Duplicate order. Skipping.';
      console.log('Found duplicate: ' + invoice.RefNumber);
      return order.save();
    } else {
      console.log('No order found...');
      console.log(invoice);
    }
  });
}

function updateInventoryPart(response) {
  return xml2js(response, {explicitArray: false}).then(result => {
    var itemInventoryRs = result.QBXML.QBXMLMsgsRs.ItemInventoryQueryRs;
    var promises = [];
    if (Array.isArray(itemInventoryRs.ItemInventoryRet)) {
      itemInventoryRs.ItemInventoryRet.forEach(qbItem => {
        var updateItem = findItemAndSave(qbItem);
        promises.push(updateItem);
      });
    } else {
      promises.push(findItemAndSave(itemInventoryRs.ItemInventoryRet));
    }
    return Promise.all(promises);
  });
}

function updateInventoryAssembly(response) {
  return xml2js(response, {explicitArray: false}).then(result => {
    var itemInventoryAssemblyRs = result.QBXML.QBXMLMsgsRs.ItemInventoryAssemblyQueryRs;
    var promises = [];
    if (Array.isArray(itemInventoryAssemblyRs.ItemInventoryAssemblyRet)) {
      itemInventoryAssemblyRs.ItemInventoryAssemblyRet.forEach(qbItem => {
        var updateItem = findItemAndSave(qbItem);
        promises.push(updateItem);
      });
    } else {
      promises.push(findItemAndSave(itemInventoryAssemblyRs.ItemInventoryAssemblyRet));
    }
    return Promise.all(promises);
  });
}

function findItemAndSave(qbItem) {
  if (qbItem) {
    var sku = qbItem.FullName.trim();
    return Item.findOne({sku: sku}).then(item => {
      if (!item) {
        console.log('Unable to find item ' + qbItem.FullName);
        return null;
      }
      else {
        return saveItemFromQB(item, qbItem);
      }
    });
  } else {  
    return 'No item to save';
  }
}

function saveItemFromQB(item, qbItem) {
  var theStock;
  if (qbItem.QuantityOnSalesOrder) {
    theStock = parseInt(qbItem.QuantityOnHand) - parseInt(qbItem.QuantityOnSalesOrder);
  } else {
    theStock = parseInt(qbItem.QuantityOnHand);
  }
  
  if (theStock < 0 || theStock == NaN) {
    theStock = 0;
  }

  var itemIsInactive = false;
  if (qbItem.IsActive == false || qbItem.IsActive == 'false') {
    itemIsInactive = true;
    theStock = 0;
  }

  var updated = (item.usStock != theStock) || (item.canStock != theStock);
  updated = updated || (item.inactive != itemIsInactive);

  item.updated = updated;
  item.stock = theStock;
  item.usStock = theStock;
  item.canStock = theStock;
  item.amazonStock = theStock;
  item.walmartStock = theStock;
  item.inactive = itemIsInactive;

  if (qbItem.DataExtRet) {
    if (qbItem.DataExtRet instanceof Array) {
      qbItem.DataExtRet.forEach(function(data) {
        addItemProperties(data, item);
      });
    } else {
      addItemProperties(qbItem.DataExtRet, item);
    }
  }

  if (qbItem.BarCodeValue && item.barcode != qbItem.BarCodeValue) {
    item.barcode = qbItem.BarCodeValue;
  }
  item.listId = qbItem.ListID;
  item.editSequence = qbItem.EditSequence;

  return item.save();
}

function addItemProperties(data, item) { // don't update the barcode in here anymore
  if (data.DataExtName == 'Location') {
    if (item.location != data.DataExtValue) {
      //item.location = data.DataExtValue;
      //item.updated = true;
    }
  } else if (data.DataExtName == 'Country' || data.DataExtName == 'C Origin') {
    if (item.countryOfOrigin != data.DataExtValue.toUpperCase()) {
      item.countryOfOrigin = data.DataExtValue.toUpperCase();
      item.updated = true;
    }
  } else if (data.DataExtName == 'HTC Code') {
    if (item.htcCode != data.DataExtValue) {
      item.htcCode = data.DataExtValue;
      item.updated = true;
    }
  } else if (data.DataExtName == 'Location 2') {
    if (item.secondLocation != data.DataExtValue) {
      //item.secondLocation = data.DataExtValue;
      //item.updated = true;
    }
  }
}

function search(query, callback) {
  Item.find(query, callback);
}

function searchSKU(sku) {
  var pattern = '^'+sku;
  return Item.find({sku: {$regex: pattern, $options:'gi'}}).limit(100);
}

function searchCustomer(email) {
  var pattern = '^'+email;
  return Customer.find({email: {$regex: pattern, $options:'gi'}}).limit(10);
}

function saveCustomer(customer) {
  var search = Customer.findOne({email: customer.email});
  search.then(function(customerDB) {
    if (customerDB) {
      updateCustomer(customerDB, customer);
    } else {
      var newCustomer = new Customer();
      newCustomer.email = customer.email;
      updateCustomer(newCustomer, customer);
    }
  });
}

function updateCustomer(dbCustomer, customer) {
  dbCustomer.firstname = customer.firstname;
  dbCustomer.lastname = customer.lastname;
  dbCustomer.email = customer.email;
  dbCustomer.phone = customer.phone;
  dbCustomer.billingAddress = customer.billingAddress;
  dbCustomer.billingAddress2 = customer.billingAddress2;
  dbCustomer.billingCity = customer.billingCity;
  dbCustomer.billingState = customer.billingState;
  dbCustomer.billingCountry = customer.billingCountry;
  dbCustomer.billingZipCode = customer.billingZipCode;
  dbCustomer.shippingAddress = customer.shippingAddress;
  dbCustomer.shippingAddress2 = customer.shippingAddress2;
  dbCustomer.shippingCity = customer.shippingCity;
  dbCustomer.shippingState = customer.shippingState;
  dbCustomer.shippingCountry = customer.shippingCountry;
  dbCustomer.shippingZipCode = customer.shippingZipCode;
  dbCustomer.defaultProfile = customer.defaultProfile;
  dbCustomer.defaultWebsite = customer.defaultWebsite;
  dbCustomer.save();
}

function saveItem(item, qbws, adjustInventory) {
  // save the item in our db
  Item.findOne({sku: item.sku}).then(theItem => {
    if (theItem) {
      // update the fields
      if (item.name)
        theItem.name = item.name;
      if (item.usPrice)
        theItem.usPrice = item.usPrice;
      if (item.canPrice)
        theItem.canPrice = item.canPrice;
      if (item.stock)
        theItem.stock = item.stock;
      if (item.usStock)
        theItem.usStock = item.usStock;
      if (item.canStock)
        theItem.canStock = item.canStock;
      if (item.location)
        theItem.location = item.location;
      if (item.secondLocation)
        theItem.secondLocation = item.secondLocation;
      if (item.barcode)
        theItem.barcode = item.barcode;
      if (item.countryOfOrigin)
        theItem.countryOfOrigin = item.countryOfOrigin;
      if (item.isOption != undefined)
        theItem.isOption = item.isOption;
      if (item.hasOptions != undefined)
        theItem.hasOptions = item.hasOptions;
      if (item.inactive != undefined)
        theItem.inactive = item.inactive;
      if (item.hidden != undefined)
        theItem.hidden = item.hidden;
      if (item.onSale != undefined)
        theItem.onSale = item.onSale;
      if (item.usSalePrice != undefined)
        theItem.usSalePrice = item.usSalePrice;
      if (theItem.canSalePrice != undefined)
        theItem.canSalePrice = item.canSalePrice;
      theItem.save().then(savedItem => {
        if (savedItem.hasOptions == undefined || savedItem.hasOptions == false) {
          saveToQuickbooks(savedItem, qbws, adjustInventory);
        }
      });
    }
  });
}

function findInQuickbooks(skus, qbws) {
  var items = skus.map(sku => {
    var item = {
      sku: sku
    };
    return item;
  });

  return new Promise((resolve, reject) => {
    qbws.addRequest(getMultipleItemsRq(items, 'item_check', [
      'ListID',
      'EditSequence',
      'Name',
      'FullName',
      'BarCodeValue',
      'IsActive',
      'QuantityOnHand',
      'DataExtRet',
      'SalesDesc',
      'SalesPrice',
      'PurchaseDesc',
      'PurchaseCost',
      'PrefVendorRef'
    ]), response => {
      return xml2js(response, {explicitArray: false}).then(result => {
        var itemInventoryRs = result.QBXML.QBXMLMsgsRs.ItemInventoryQueryRs;
        if (itemInventoryRs.$.requestID == 'itemRequest-item_check') {
          console.log(itemInventoryRs);
          resolve(itemInventoryRs);
        }
      });
    });
  });
}

/**
 * Gets the item from Quickbooks, updates the necessary information. Then
 * provides a callback function which takes the savedItem and the item from QB.
 */
function saveToQuickbooks(item, qbws, adjustInventory) {
  // create request in qb
  console.log('\nADDING GET ITEM REQUEST\n');
  qbws.addRequest(getItemRq(item), response => {
    return xml2js(response, {explicitArray: false}).then(result => {
      var itemInventoryRs = result.QBXML.QBXMLMsgsRs.ItemInventoryQueryRs;
      if (itemInventoryRs.$.requestID == 'itemRequest-'+item.sku) {
        console.log('\ngot the item request\n');
        item.editSequence = itemInventoryRs.ItemInventoryRet.EditSequence;
        item.listId = itemInventoryRs.ItemInventoryRet.ListID;
        return item.save().then(savedItem => {
          console.log('\nadding modify item request\n');
          qbws.addRequest(modifyItemRq(savedItem), (response) => {
            console.log('\nadding inventory and custom field request\n');
            if (adjustInventory) {
              qbws.addRequest(modifyInventoryRq(savedItem));
            }
            if (savedItem.location)
              qbws.addRequest(modifyCustomField('Location', savedItem.location, savedItem.listId));
            if (savedItem.secondLocation)
              qbws.addRequest(modifyCustomField('Location 2', savedItem.secondLocation, savedItem.listId));
            return Promise.resolve('Done.');
          });
        });
      }
    });
  });
}

/**
 * This is all the items and the options
 */
function queryAllItems(qbws) {
  return Item.find({}).then(items => {
    qbws.addRequest(getMultipleItemsRq(items), updateInventoryPart, true);
    qbws.addRequest(getMultipleItemAssemblyRq(items), updateInventoryAssembly, true); // how do we know if it's a bundle?
    var promises = [];
    items.forEach(item => {
      item.updated = false;
      promises.push(item.save());
    });
    return Promise.all(promises);
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

function getOrderReport(settings) {
  var successOrders = Order.find({imported: true, timecode: {$in: settings.lastImports}});
  var failedOrders = Order.find({imported: false, timecode: {$in: settings.lastImports}});

  return successOrders.then((successes) => {
    return failedOrders.then((failures) => {
      return {
        success: successes,
        fail: failures
      }
    });
  });
}

function getSlackOrderReport(report) {
  var failMessage = report.fail.length + ' orders were not imported.';
  var successMessage = report.success.length + ' orders were successfully imported.';

  var successFields = [];
  var failFields = [];

  // TMI
  // report.success.forEach((order) => {
  //   var infoURL = 'https://www.ecstasycrafts.' + (order.canadian ? 'ca' : 'com') + '/admin/order_details.asp?orderid=' + order.cartOrder.OrderID;
  //   var field = {
  //     title: order.name,
  //     value: '<'+infoURL+'|'+order.orderId + '> ' + (order.message == undefined ? '' : order.message),
  //     short: true
  //   };
  //   successFields.push(field);
  // });

  report.fail.forEach((order) => {
    var infoURL = 'https://www.ecstasycrafts.' + (order.canadian ? 'ca' : 'com') + '/admin/order_details.asp?orderid=' + order.cartOrder.OrderID;
    var field = {
      title: order.name,
      value: '<'+infoURL+'|'+order.orderId + '> ' + (order.message == undefined ? '' : order.message),
      short: true
    };
    failFields.push(field);
  });

  var successAttachment = {
    fallback: successMessage,
    pretext: successMessage,
    fields: successFields
  };

  var failAttachment = {
    fallback: failMessage,
    pretext: failMessage,
    fields: failFields
  };

  return {
    attachments: [successAttachment, failAttachment]
  }
}

function calculateSubtotal(order) {
  var total = 0;
  var promises = [];
  var message = '';

  order.forEach(function(item) {
    promises.push(Item.findOne({sku: item.sku}));
  });

  return Promise.all(promises).then((dbItems) => {
    dbItems.forEach((dbItem) => {
      order.forEach(function(item) {
        if (dbItem == null) {
          message = 'One or more items was not found in the database. The subtotal will not reflect these items.';
        } else {
          if (item.sku == dbItem.sku) {
            var lineTotal = (dbItem.usPrice / 2) * item.quantity;
            total += lineTotal; // wholesale prices
            item.total = lineTotal;
          }
        }
      });
    });

    return {
      total: total.toFixed(2),
      message: message
    }
  });
}

function get3DCartOptions(url, method, canadian) {
  var options = {
    url: url,
    method: method,
    headers: {
      SecureUrl: 'https://www.ecstasycrafts.' + (canadian ? 'ca' : 'com'),
      PrivateKey: process.env.CART_PRIVATE_KEY,
      Token: canadian ? process.env.CART_TOKEN_CANADA : process.env.CART_TOKEN 
    },
    json: true
  }
  return options;
}

function saveManifest(manifest) {
  if (manifest._id) {
    var findManifest = Manifest.findOne({_id: manifest._id});
    return findManifest.then(dbManifest => {
      return updateManifest(dbManifest, manifest);
    });
  } else {
    var newManifest = new Manifest();
    return updateManifest(newManifest, manifest);
  }
}

function updateManifest(dbManifest, manifest) {
  setTimeCode();
  dbManifest.lastModified = getTimeCode();
  dbManifest.shipDate = manifest.shipDate;
  dbManifest.orders = manifest.orders;
  dbManifest.totalWeight = manifest.totalWeight;
  dbManifest.totalValue = manifest.totalValue;
  dbManifest.totalParcels = manifest.totalParcels;
  dbManifest.markModified('orders');
  dbManifest.markModified('lastModified');
  return dbManifest.save();
}

function removeManifest(manifest) {
  return Manifest.remove({_id: manifest._id});
}

function searchAddress(address) {
  var pattern = '^'+address;
  return Address.find({AddressName: {$regex: pattern, $options:'gi'}}).limit(100);
}

function saveAddress(shipmentInfo) {
  var name = '';
  name += shipmentInfo.ShipmentAddress + ', ' + shipmentInfo.ShipmentCity + ', ' + shipmentInfo.ShipmentState;
  var findAddress = Address.findOne({AddressName: name});
  return findAddress.then(dbAddress => {
    if (dbAddress) {
      return updateAddress(dbAddress, shipmentInfo);
    } else {
      var newAddress = new Address();
      newAddress.AddressName = name;
      return updateAddress(newAddress, shipmentInfo);
    }
  });
}

function updateAddress(dbAddress, shipmentInfo) {
  dbAddress.ShipmentCompany = shipmentInfo.ShipmentCompany;
  dbAddress.ShipmentAddress = shipmentInfo.ShipmentAddress;
  dbAddress.ShipmentAddress2 = shipmentInfo.ShipmentAddress2;
  dbAddress.ShipmentCity = shipmentInfo.ShipmentCity;
  dbAddress.ShipmentState = shipmentInfo.ShipmentState;
  dbAddress.ShipmentCountry = shipmentInfo.ShipmentCountry;
  dbAddress.ShipmentZipCode = shipmentInfo.ShipmentZipCode;
  dbAddress.ShipmentFirstName = shipmentInfo.ShipmentFirstName;
  dbAddress.ShipmentLastName = shipmentInfo.ShipmentLastName;

  return dbAddress.save();
}

function findItemsForOrder(itemList) {
  var skus = [];
  
  // remove duplicates
  for (var i = 0; i < itemList.length; i++) {
    for (var j = 0; j < itemList.length; j++) {
      if (itemList[i].sku == itemList[j].sku && i != j) { // duplicate
        var quantity = parseInt(itemList[i].quantity) + parseInt(itemList[j].quantity);
        itemList[i].quantity = quantity;
        // now remove it from the list
        itemList.splice(j, 1);
        j--;
      }
    }
    skus.push(itemList[i].sku);
  }

  var findItems = Item.find({sku: {$in: skus}}).lean();
  return findItems.then(items => {
    items.forEach(dbItem => {
      itemList.forEach(item => {
        if (dbItem.sku == item.sku) {
          dbItem.quantity = item.quantity;
        }
      });
    });

    return items;
  });
}

function setItemFieldsForAmazon(order) {
  var promises = [];
  order.OrderItemList.forEach(item => {
    var findItem = Item.findOne({sku: item.ItemID});
    var updateItem = findItem.then(dbItem => {
      if (dbItem) {
        if (order.InvoiceNumberPrefix == 'AZ-') {
          item.ItemUnitStock = dbItem.usStock;
          item.ItemWarehouseLocation = dbItem.location;
        } else {
          if (dbItem.isOption) { // needs the location
            item.ItemWarehouseLocation = dbItem.location;
          }
        }
        item.ItemBarcode = dbItem.barcode;
        item.ItemWarehouseLocationSecondary = dbItem.secondLocation;
      }
    });
    promises.push(updateItem);
  });
  return Promise.all(promises).then(() => {
    return order;
  });
}

function inventoryBot(payload) {
  var options = {
    url: 'https://hooks.slack.com/services/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',
    method: 'POST',
    json: true,
    body: payload
  };
  return rp(options);
}

function savePO(purchaseOrder) {
  if (purchaseOrder._id) { // existing document
    return PO.findOne({_id: purchaseOrder._id}).then(doc => {
      return updatePOFields(doc, purchaseOrder);
    });
  } else {
    var newPO = new PO();
    return updatePOFields(newPO, purchaseOrder);
  }
}

function updatePOFields(dbPO, po) {
  dbPO.name = po.name;
  dbPO.delivery = po.delivery;
  dbPO.items = po.items;
  dbPO.inQuickbooks = po.inQuickbooks;
  dbPO.manufacturer = po.manufacturer;
  dbPO.poNumber = po.poNumber;
  dbPO.date = po.date;
  dbPO.lastModified = new Date();
  dbPO.markModified('items');
  return dbPO.save();
}

function saveDelivery(delivery) {
  if (delivery._id) { // existing document
    return Delivery.findOne({_id: delivery._id}).then(doc => {
      return updateDeliveryFields(doc, delivery);
    });
  } else {
    var newDelivery = new Delivery();
    return updateDeliveryFields(newDelivery, delivery);
  }
}

function updateDeliveryFields(dbDelivery, delivery) {
  dbDelivery.purchaseOrders = delivery.purchaseOrders;
  dbDelivery.name = delivery.name;
  dbDelivery.status = delivery.status;
  dbDelivery.comments = delivery.comments;
  dbDelivery.manufacturer = delivery.manufacturer;
  dbDelivery.date = delivery.date;
  dbDelivery.poNumber = delivery.poNumber;
  return dbDelivery.save();
}

function getDeliveries() {
  return Delivery.find({}).sort('date');
}

function removeDelivery(delivery) {
  return Delivery.remove({_id: delivery._id});
}

module.exports = {
  getXMLRequest : getXMLRequest,
  getXMLDoc: getXMLDoc,
  createShippingAddress : createShippingAddress,
  addCustomerRq : addCustomerRq,
  createItemRq: createItemRq,
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
  modifyItemsInventoryRq: modifyItemsInventoryRq,
  search: search,
  saveItem: saveItem,
  findInQuickbooks: findInQuickbooks,
  saveToQuickbooks: saveToQuickbooks,
  queryAllItems: queryAllItems,
  getItemRq: getItemRq,
  createInvoiceRequests: createInvoiceRequests,
  searchSKU: searchSKU,
  searchCustomer: searchCustomer,
  updateCustoemr: updateCustomer,
  saveCustomer: saveCustomer,
  getOrderReport: getOrderReport,
  getSlackOrderReport: getSlackOrderReport,
  calculateSubtotal: calculateSubtotal,
  get3DCartOptions: get3DCartOptions,
  saveManifest: saveManifest,
  removeManifest: removeManifest,
  searchAddress: searchAddress,
  saveAddress: saveAddress,
  findItemsForOrder: findItemsForOrder,
  setItemFieldsForAmazon: setItemFieldsForAmazon,
  inventoryBot: inventoryBot,
  savePO: savePO,
  saveDelivery: saveDelivery,
  getDeliveries: getDeliveries,
  removeDelivery: removeDelivery,
  addSalesOrderRq: addSalesOrderRq,
  createSalesOrdersRequests: createSalesOrdersRequests,
  createInvoiceFromSalesOrder: createInvoiceFromSalesOrder
}