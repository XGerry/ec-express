var mongoose = require('mongoose');
var builder = require('xmlbuilder');
var request = require('request');
var rp = require('request-promise-native');
var Item = require('./item');
var moment = require('moment');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;

var orderSchema = new mongoose.Schema({
	cartOrder : Object,
	batch: {
		type: ObjectId,
		ref: 'Batch'
	},
	items: [{
		item: {
			type: ObjectId,
			ref: 'Item',
		},
		quantity: Number,
		pickedQuantity: {
			type: Number,
			default: 0
		},
		price: Number
	}],
  customer: {
    type: ObjectId,
    ref: 'Customer'
  },
	orderId : String,
	requestId : Number,
  comments: String,
	message : String,
	timecode: Number,
	orderValue: Number,
	orderDate: Date,
  shipDate: Date,
	dueDate: Date,
	manual: Boolean,
	retry: Boolean, // the order is being imported again
	canadian: Boolean, // the order is canadian
	amazon: Boolean,
	imported : Boolean, // the order has been imported as a sales order in quickbooks
	trackingNumber: String,
	shippingCost: Number,
	completed: { // status (pretty sure this is deprecated)
		type: Boolean,
		default: false
	},
	picked: { // the order has been picked
		type: Boolean,
		default: false
	},
	invoiced: { // the order has been invoiced in quickbooks
		type: Boolean,
		default: false
	},
	toPrint: {
		type: Boolean,
		default: true
	},
	paid: {
		type: Boolean,
		default: false
	},
	rush: {
		type: Boolean,
		default: false
	},
  hold: {
    type: Boolean,
    default: false
  }
}, {
  toObject: {
    virtuals: true
  },
  toJSON: {
    virtuals: true
  },
  usePushEach: true
});

orderSchema.statics.findUnpaidOrders = function(canadian) {
  return this.find({paid: false, invoiced: true, picked: true, canadian: canadian});
}

orderSchema.methods.updateCustomer = function() {
  var order = this;
  return mongoose.model('Customer').findOne({email: this.cartOrder.BillingEmail}).then(function(customer) {
    if (customer) {
      customer.updateFrom3DCart(order.cartOrder);
      order.customer = customer._id;
      customer.orders.push(order._id);
      customer.save();
      return order.save();
    } else {
      return mongoose.model('Customer').createCustomer(order.cartOrder).then(function(newCustomer) {
        order.customer = newCustomer._id;
        newCustomer.orders.push(order._id);
        newCustomer.save();
        return order.save();
      });
    }
  });
}

orderSchema.methods.updateFrom3DCart = function(cartOrder) {
  var promises = [];
  this.cartOrder = cartOrder;
  
  var addCustomer = this.updateCustomer(cartOrder);
  promises.push(addCustomer);

  this.canadian = cartOrder.InvoiceNumberPrefix == 'CA-';
  this.amazon = cartOrder.InvoiceNumberPrefix == 'AZ-';
  this.orderDate = new Date(cartOrder.OrderDate);
  this.markModified('cartOrder');
  this.orderValue = cartOrder.OrderAmount;
  this.dueDate = getDueDate(cartOrder.OrderDate, this);
  this.shippingCost = cartOrder.ShipmentList[0].ShipmentCost;
  this.comments = cartOrder.InternalComments;

  this.items = [];
  cartOrder.OrderItemList.forEach(item => {
  	var sku = item.ItemID.trim();
  	var findItem = Item.findOne({sku: sku}).then(dbItem => {
  		if (dbItem) {
		  	this.items.push({
		  		item: dbItem._id,
		  		quantity: item.ItemQuantity,
		  		pickedQuantity: 0,
		  		price: item.ItemUnitPrice
		  	});
  		} else {
  			console.log('item not found');
  		}
  	});
  	promises.push(findItem);
  });

  return Promise.all(promises).then(() => {
  	// after the order is created, move it to the queue
  	return this.save().then(savedOrder => {
  		return savedOrder.updateOrderStatus(8); // Queued
  	});
  });
}

orderSchema.methods.removeBatch = function() {
	if (this.batch) {
		return this.populate('batch').execPopulate().then(() => {
			if (this.batch) {
				return this.batch.removeOrder(this._id).then(() => {
					this.batch = null;
					return this.save();
				});
			} else {
				this.batch = null;
				this.markModified('batch');
				return this.save();
			}
		});
	} else {
		this.batch = null;
		this.markModified('batch');
		return this.save();
	}
}

orderSchema.methods.updateOrderStatus = function(status) {
	var options = get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders/'+this.cartOrder.OrderID, 'PUT', this.canadian);
	options.body = {
		OrderStatusID: status
	};

	return this.save().then(o => {
		return rp(options).then(response => {
			return response;
		});
	});
}

orderSchema.methods.updateDueDate = function() {
	this.dueDate = getDueDate(this.orderDate, this);
	return this.save();
}

orderSchema.methods.updateOrder = function(order) {
	delete order.__v;
	this.set(order);
  // update the shipping address
  this.markModified('cartOrder');
	this.save();
	var oldOrder = {};
	// replace the items
	oldOrder.OrderItemList = [];
	oldOrder.ShipmentList = order.cartOrder.ShipmentList;
  delete oldOrder.ShipmentList[0].ShipmentOrderStatus;
  delete oldOrder.ShipmentList[0].ShipmentTrackingCode;
	oldOrder.ShipmentList[0].ShipmentCost = this.shippingCost;
  if (this.trackingNumber)
    oldOrder.ShipmentList[0].ShipmentTrackingCode = this.trackingNumber;
  if (this.comments)
    oldOrder.InternalComments = this.comments;

	this.items.forEach(item => {
		var orderItem = {
	    ItemID: item.item.sku,
	    ItemQuantity: item.quantity,
	    ItemUnitPrice: item.price,
	    ItemDescription: item.item.name
	  };
	  oldOrder.OrderItemList.push(orderItem);
	});

	var options = get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders/'+this.cartOrder.OrderID, 'PUT', this.canadian);
	options.body = oldOrder;
	return rp(options);
}

orderSchema.methods.invoiceTo3DCart = function() {
	var cartOrder = {};
	cartOrder.OrderItemList = [];
	this.items.forEach(item => {
		var orderItem = {
	    ItemID: item.item.sku,
	    ItemQuantity: item.pickedQuantity,
	    ItemUnitPrice: item.price,
	    ItemDescription: item.item.name
	  };
	  cartOrder.OrderItemList.push(orderItem);
	});

	var options = get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders/'+this.cartOrder.OrderID, 'PUT', this.canadian);
	options.body = cartOrder;
	return rp(options);
}

orderSchema.methods.customerRq = function() {
	console.log('Creating customer ' + this.cartOrder.BillingFirstName + ' ' + order.BillingLastName);

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

orderSchema.methods.addSalesOrderRq = function() {
  var invoiceAdds = [];
  this.items.forEach(item => {
  	var lineItem = {
  		ItemRef : {
        FullName : item.item.sku
      },
      Quantity : item.quantity,
      Rate : item.price,
      InventorySiteRef: {
        FullName: 'Warehouse'
      }
  	};
  	invoiceAdds.push(lineItem);
  });

  // another place there could be a discount
  // let's just add all the discounts lumped into one line
  if (this.cartOrder.OrderDiscount > 0) {
    invoiceAdds.push({
      ItemRef : {
        FullName : "DISC"
      },
      Desc : 'All discounts on order',
      Rate: this.cartOrder.OrderDiscount
    });
  }

  // add the shipping cost as a line item
  invoiceAdds.push({
    ItemRef : {
      FullName : "Shipping & Handling"
    },
    Rate : this.shippingCost
  });

  // we need to add a surcharge if they are a Canadian customer (only when coming from the US website)
  if (!this.canadian) {
    var country = this.cartOrder.BillingCountry;
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
  
  var shippingMethod = this.cartOrder.ShipmentList[0].ShipmentMethodName.slice(0,15); // max 15 characters
  shippingMethod = (shippingMethod !== '') ? shippingMethod : 'cheapest way'; // default for now

  var paymentMethod3DCart = this.cartOrder.BillingPaymentMethod;
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

  var customerRef = this.cartOrder.BillingLastName + ' ' + this.cartOrder.BillingFirstName;
  // var customerRef = order.BillingEmail;

  // find the PO number in the comments
  var commentArray = this.cartOrder.CustomerComments.split('\n');
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
  if (this.cartOrder.BillingFirstName == 'Amazon') {
    customerRef = 'Amazon';
  } else if (this.cartOrder.BillingFirstName == 'Amazon.') {
    customerRef = 'Amazon. ca';
  }

  var obj = {
    SalesOrderAddRq : {
      '@requestID' : this.orderId,
      SalesOrderAdd : {
        CustomerRef : {
          FullName : customerRef
        },
        TxnDate : moment(this.orderDate).format('YYYY-MM-DD'),
        RefNumber : this.orderId,
        BillAddress: createBillingAddress(this.cartOrder),
        ShipAddress : createShippingAddress(this.cartOrder),
        PONumber: po,
        TermsRef : {
          FullName : paymentMethod
        },
        ShipMethodRef : {
          FullName : shippingMethod
        },
        Memo : comments + ' - API Import ('+this.timecode+')',
        IsToBePrinted : true,
        SalesOrderLineAdd : invoiceAdds
      }
    }
  };
  var xmlDoc = getXMLRequest(obj);
  var str = xmlDoc.end({'pretty' : true});
  return str;
}

orderSchema.methods.modifySalesOrderRq = function(qbOrder) {
	// for now, let's just update the items
  var salesOrderItems = [];
  if (!Array.isArray(qbOrder.SalesOrderLineRet)) {
  	qbOrder.SalesOrderLineRet = [qbOrder.SalesOrderLineRet];
  }
	this.items.forEach(item => {
		var newItem = true;
		qbOrder.SalesOrderLineRet.forEach(lineItem => {
			if (lineItem.ItemRef.FullName == item.item.sku) {
				// we have a match, update the quantity and price
				lineItem.Quantity = item.quantity;
				lineItem.Rate = item.price;
				delete lineItem.Invoiced;
				delete lineItem.Amount;
				delete lineItem.IsManuallyClosed;
				newItem = false;
				salesOrderItems.push(lineItem);
			}
		});

		if (newItem) {
			var lineItem = {
				TxnLineID: -1,
	  		ItemRef: {
	        FullName: item.item.sku
	      },
	      Quantity: item.quantity,
	      Rate: item.price,
	      InventorySiteRef: {
	        FullName: 'Warehouse'
	      }
	  	};
	  	salesOrderItems.push(lineItem);
		}
  });

  var obj = {
  	SalesOrderModRq: {
  		SalesOrderMod: {
  			TxnID: qbOrder.TxnID,
  			EditSequence: qbOrder.EditSequence,
  			SalesOrderLineMod: salesOrderItems
  		}
  	}
  };

  var xmlDoc = getXMLRequest(obj);
  var str = xmlDoc.end({pretty: true});
  return str;
}

orderSchema.methods.createInvoiceRq = function(qbSalesOrder) {
	var invoiceItems = [];
  var quantityPickedMap = {};
  this.items.forEach(i => {
    quantityPickedMap[i.item.sku] = i.pickedQuantity;
  });

  qbSalesOrder.SalesOrderLineRet.forEach(item => { // shipping cost
    if (item.ItemRef.FullName == 'Shipping & Handling') {
      invoiceItems.push({
      	SalesTaxCodeRef: item.SalesTaxCodeRef,
      	LinkToTxn: {
      		TxnID: qbSalesOrder.TxnID,
      		TxnLineID: item.TxnLineID
      	}
      });
    } else {
      invoiceItems.push({
        Quantity: quantityPickedMap[item.ItemRef.FullName],
        SalesTaxCodeRef: item.SalesTaxCodeRef,
        LinkToTxn: {
          TxnID: qbSalesOrder.TxnID,
          TxnLineID: item.TxnLineID
        }
      });
    }
  });

  var addInvoiceRq = {
    InvoiceAddRq: {
      '@requestID': this.orderId,
      InvoiceAdd: {
        CustomerRef: {
          ListID: qbSalesOrder.CustomerRef.ListID
        },
        RefNumber: this.orderId,
        InvoiceLineAdd: invoiceItems
      }
    }
  };

  var xmlDoc = getXMLRequest(addInvoiceRq);
  var str = xmlDoc.end({pretty: true});
  console.log(str);
  return str;
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

// helpers

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

function getXMLRequest(request) {
  var xmlDoc = builder.create('QBXML', { version: '1.0', encoding: 'ISO-8859-1'})
  .instructionBefore('qbxml', 'version="13.0"')
  .ele('QBXMLMsgsRq', { 'onError': 'continueOnError' });
  xmlDoc.ele(request);
  return xmlDoc;
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

function getDueDate(date, order) {
	var orderDate = moment(date);
	if (order.canadian) {
		if (orderDate.day() == 3) { // Wednesday
			orderDate.day(8); // Next Monday
		} else if (orderDate.day() == 4) { // Thursday
			orderDate.day(9); // Next Tuesday
		} else if (orderDate.day() == 5) { // Friday
			orderDate.day(10); // Next Wednesday
		} else if (orderDate.day() == 6) { // Saturday
			orderDate.day(10); // Next Wednesday
		} else {
			orderDate.add(3, 'days');
		}
		return orderDate;
	} else {
		if (orderDate.day() == 0) { // Sunday
			orderDate.day(3); // Wednesday
		} else if (orderDate.day() == 1) { // Monday
			orderDate.day(3); // Wednesday
		} else if (orderDate.day() == 2) { // Tuesday
			orderDate.day(4); // Thursday
		} else if (orderDate.day() == 3) { // Wednesday
			orderDate.day(4); // Thursday
		} else if (orderDate.day() == 4) { // Thursday
			orderDate.day(5); // Friday
		} else if (orderDate.day() == 5) { // Friday
			orderDate.day(8); // Next Monday
		} else if (orderDate.day() == 6) { // Saturday
			orderDate.day(9); // Next Tuesday
		}
		return orderDate;
	}
}

module.exports = mongoose.model('Order', orderSchema);