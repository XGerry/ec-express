var mongoose = require('mongoose');
var builder = require('xmlbuilder');
var request = require('request');
var rp = require('request-promise-native');
var Item = require('./item');
var moment = require('moment');
var _ = require('lodash');
const CartMarketplace = require('../cartMarketplace');
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
	orderId : {
    type: String,
    index: true,
    unique: true
  },
	requestId : Number,
  comments: String,
	message : String,
	timecode: Number,
  paymentMethod: String,
	orderValue: Number,
  orderProfit: {
    type: Number,
    default: 0
  },
	orderDate: Date,
  shipDate: Date,
  shipWeight: Number,
	dueDate: Date,
	retry: Boolean, // the order is being imported again
	canadian: Boolean, // the order is canadian
  isCartOrder: {
    type: Boolean,
    default: false
  },
  isBackorder: {
    type: Boolean,
    default: false
  },
	amazon: Boolean,
	imported : {
    type: Boolean,
    default: false
  }, // the order has been imported as a sales order in quickbooks
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
  },
  backorders: [{
    type: ObjectId,
    ref: 'Order'
  }],
  parent: {
    type: ObjectId,
    ref: 'Order'
  },
  reasonForHold: String,
  reasonForUnpaid: String,
  salesTax: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  promotionList: [{
    type: ObjectId,
    ref: 'Promotion'
  }],
  stripeInvoice: String,
  payments: [{
    amount: Number,
    reference: String,
    method: String,
    cartId: String,
    type: {
      type: String,
      enum: ['Authorize', 'Manual', 'Capture', 'Sale']
    }
  }],
  flags: {
    emailSent: {
      type: Boolean,
      default: false
    },
    paymentsApplied: {
      type: Boolean,
      default: false
    }
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

orderSchema.pre('save', async function() {
  // todo calculate the discounts
  await this.calculateSalesTax(); // calculate the sales tax
});

orderSchema.virtual('incomplete').get(function() {
  return (this.numberOfItemsPicked < this.numberOfItems) && (this.backorders.length == 0);
});

orderSchema.virtual('numberOfItems').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

orderSchema.virtual('numberOfItemsPicked').get(function() {
  return this.items.reduce((total, item) => total + item.pickedQuantity, 0);
});

orderSchema.virtual('pickedTotal').get(function() {
  return this.items.reduce((total, item) => total + (item.pickedQuantity * item.price), 0);
});

orderSchema.virtual('subtotal').get(function() {
  return this.pickedTotal + this.shippingCost - this.discount;
});

orderSchema.virtual('balance').get(function() {
  let total = this.subtotal + this.salesTax;
  let validPayments = this.payments.filter(payment => {
    return payment.type == 'Capture' || payment.type == 'Manual' || payment.type == 'Sale';
  });
  let paid = validPayments.reduce((total, payment) => total += payment.amount, 0);
  return total - paid;
});

orderSchema.statics.findUnpaidOrders = function(canadian) {
  return this.find({paid: false, invoiced: true, picked: true, canadian: canadian});
}

orderSchema.statics.findOrdersToBeInvoiced = function(canadian) {
  return this.find({invoiced: false, picked: true, hold: false, canadian: canadian});
}

orderSchema.statics.createCustomOrder = async function(order) {
  var newOrder = new this();
  var customer = await mongoose.model('Customer').findOne({email: order.customer.email}).exec();
  if (!customer) {
    // create the customer
    newCustomer = await mongoose.model('Customer').createCustomCustomer(order.customer);
    newOrder.customer = newCustomer._id;
  } else {
    newOrder.customer = customer._id;
  }

  await customer.addOrder(newOrder._id);

  newOrder.comments = order.comments + '\nPO:'+ order.poNumber;
  newOrder.orderDate = new Date();
  newOrder.canadian = order.customer.billingCountry == 'CA';
  let orderNumber = await mongoose.model('Settings').getNextOrderNumber();
  newOrder.orderId = 'CO-' + orderNumber;

  var promises = [];
  order.items.forEach(function(item) {
    let getId = Item.findOne({sku: item.sku}).then(dbItem => {
      newOrder.items.push({
        item: dbItem._id,
        quantity: parseInt(item.quantity),
        pickedQuantity: 0,
        price: item.salesPrice
      });
    });
    promises.push(getId);
  });

  newOrder.orderValue = order.total;
  newOrder.isCartOrder = false;
  newOrder.dueDate = getDueDate(newOrder.orderDate, newOrder);
  newOrder.shippingCost = order.shipping;
  newOrder.paymentMethod = 'On Account';
  newOrder.cartOrder = {};

  console.log(order.customer);

  newOrder.cartOrder.ShipmentList = [{
    ShipmentAddress: order.customer.shippingAddress,
    ShipmentAddress2: order.customer.shippingAddress2,
    ShipmentCity: order.customer.shippingCity,
    ShipmentState: order.customer.shippingState,
    ShipmentZipCode: order.customer.shippingZipCode,
    ShipmentCountry: order.customer.shippingCountry,
    ShipmentMethodName: 'cheapest way'
  }];
  newOrder.markModified('cartOrder');

  console.log(newOrder.cartOrder);

  return Promise.all(promises).then(() => {
    return newOrder.save();
  });
}

orderSchema.methods.updateCustomer = function() {
  var order = this;
  return mongoose.model('Customer').findOne({email: this.cartOrder.BillingEmail}).then(async function(customer) {
    if (customer) {
      if (order.isCartOrder)
        customer.updateFrom3DCart(order.cartOrder);
      order.customer = customer._id;
      await customer.addOrder(order._id);
      return order.save();
    } else {
      if (order.isCartOrder) {
        var newCustomer = await mongoose.model('Customer').createCustomer(order.cartOrder);
        order.customer = newCustomer._id;
        await newCustomer.addOrder(order._id);
        return order.save();
      }
    }
  });
}

orderSchema.methods.updateFrom3DCart = async function(cartOrder) {
  var promises = [];
  this.cartOrder = cartOrder;
  
  this.isCartOrder = true; 
  await this.updateCustomer(cartOrder);

  this.canadian = cartOrder.InvoiceNumberPrefix == 'CA-';
  this.amazon = cartOrder.InvoiceNumberPrefix == 'AZ-';
  this.orderDate = new Date(cartOrder.OrderDate);
  this.markModified('cartOrder');
  this.orderValue = cartOrder.OrderAmount;
  this.dueDate = getDueDate(cartOrder.OrderDate, this);
  this.shippingCost = cartOrder.ShipmentList[0].ShipmentCost;
  this.comments = cartOrder.InternalComments;
  this.paymentMethod = cartOrder.BillingPaymentMethod;
  this.discount = cartOrder.OrderDiscount;

  this.items = [];
  var theOrder = this;
  for (item of cartOrder.OrderItemList) {
  	var sku = item.ItemID.trim();
  	await Item.findOne({sku: sku}).then(function(dbItem) {
  		if (dbItem) {
		  	theOrder.items.push({
		  		item: dbItem._id,
		  		quantity: item.ItemQuantity,
		  		pickedQuantity: 0,
		  		price: item.ItemUnitPrice
		  	});
  		} else {
  			console.log('item not found: ' + sku);
        // create the new item here
        //let newItem = 
  		}
  	});
  }

	// after the order is created, move it to the queue
	return this.save().then(savedOrder => {
		return savedOrder.updateOrderStatus(8); // Queued
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

orderSchema.methods.updateOrderStatus = async function(status) {
	var options = get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders/'+this.cartOrder.OrderID, 'PUT', this.canadian);
	options.body = {
		OrderStatusID: status
	};
	
  if (this.isCartOrder)	{
    await this.save();
    try {
      let response = await rp(options);
      return response;
    } catch(err) {
      return Promise.resolve('Unable to move order in 3D Cart.');
    }
  } else {
    return this.save();
  }
}

orderSchema.methods.updateDueDate = function() {
	this.dueDate = getDueDate(this.orderDate, this);
	return this.save();
}

orderSchema.methods.updateOrder = async function(order) {
	delete order.__v;
	this.set(order);
  // update the shipping address
  this.markModified('cartOrder');
	await this.save();
	if (this.isCartOrder) {
    return this.updateOrderIn3DCart(order);
  } else {
    return Promise.resolve(this);
  }
}

orderSchema.methods.updateOrderIn3DCart = function(order) {
  var oldOrder = {};
  // replace the items
  oldOrder.BillingAddress = order.cartOrder.BillingAddress;
  oldOrder.BillingAddress2 = order.cartOrder.BillingAddress2;
  oldOrder.BillingState = order.cartOrder.BillingState;
  oldOrder.BillingZipCode = order.cartOrder.BillingZipCode;
  oldOrder.BillingCountry = order.cartOrder.BillingCountry;
  oldOrder.ShipmentList = order.cartOrder.ShipmentList;
  oldOrder.ShipmentList[0].ShipmentShippedDate = order.shipDate;
  oldOrder.OrderDiscount = order.discount;
  delete oldOrder.ShipmentList[0].ShipmentOrderStatus;
  delete oldOrder.ShipmentList[0].ShipmentTrackingCode;
  oldOrder.ShipmentList[0].ShipmentCost = this.shippingCost;
  if (this.trackingNumber)
    oldOrder.ShipmentList[0].ShipmentTrackingCode = this.trackingNumber;
  if (this.comments)
    oldOrder.InternalComments = this.comments;

  if (!this.invoiced) { // only change the item quantities if the order has not been invoiced
    oldOrder.OrderItemList = [];
    this.items.forEach(item => {
      var orderItem = {
        ItemID: item.item.sku,
        ItemQuantity: item.quantity,
        ItemUnitPrice: item.price,
        ItemDescription: item.item.name
      };
      oldOrder.OrderItemList.push(orderItem);
    });
  }
  this.updateCustomer();
  var options = get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Orders/'+this.cartOrder.OrderID, 'PUT', this.canadian);
  options.body = oldOrder;
  return rp(options);
}

orderSchema.methods.calculateProfit = async function() {
  // iterate over the picked items and tally up the sales (only include items sent)
  var totalSales = 0;
  var totalCost = 0;
  await this.populate('items.item').execPopulate();
  _.each(this.items, item => {
    var itemCost = item.item.cost;
    if (itemCost == undefined) {
      itemCost = 0;
    }
    if (this.canadian) {
      totalCost += (itemCost * 1.2) * item.pickedQuantity;
    } else {
      totalCost += itemCost * item.pickedQuantity;
    }
    totalSales += item.price * item.pickedQuantity;
  });

  if (isNaN(totalCost)) {
    totalCost = 0;
  }
  if (isNaN(totalSales)) {
    totalSales = 0;
  }
  this.orderProfit = totalSales - totalCost;
  return this.save();
}

orderSchema.methods.createBackorder = async function() {
  // find the items that have not been picked and move them to a new order
  // the back order should not be added to Quickbooks as a sales order
  // it should also not be imported to 3D Cart
  if (this.numberOfItemsPicked >= this.numberOfItems) {
    console.log('No need for backorder');
    return Promise.reject('Back order not allowed for a completed order');
  }

  var backOrder = new this.constructor();
  backOrder.customer = this.customer;
  await this.populate('customer items.item').execPopulate();
  this.customer.orders.push(backOrder._id);
  backOrder.cartOrder = this.cartOrder; // TODO: change to use dedicated shipping address
  backOrder.canadian = this.canadian;
  backOrder.orderId = this.orderId + '-BO';
  backOrder.isBackorder = true;
  backOrder.imported = true; // Make sure this doesn't get sent to quickbooks as a sales order

  // add the items
  var backorderItems = [];
  var orderValue = 0;
  for (item of this.items) {
    if (item.pickedQuantity < item.quantity && item.item.availableForBackorder && !item.item.discontinued) {
      var bItem = {
        item: item.item,
        quantity: item.quantity - item.pickedQuantity,
        pickedQuantity: 0,
        price: item.price
      }
      backorderItems.push(bItem);
      orderValue += bItem.quantity * bItem.price;
    }
  }

  backOrder.items = backorderItems;
  backOrder.orderValue = orderValue;
  backOrder.shippingCost = 0;
  backOrder.orderDate = new Date();
  backOrder.dueDate = getDueDate(backOrder.orderDate, backOrder);
  backOrder.comments = "This is a back order";
  backOrder.parent = this._id;
  backOrder.hold = true; // on hold by default
  backOrder.reasonForHold = "Back order";
  backOrder.paymentMethod = "On Account"; // Default it on account for now
  this.backorders.push(backOrder._id);
  await backOrder.save();
  await this.customer.save();
  return this.save();
}

orderSchema.methods.invoiceTo3DCart = async function() {
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
  if (this.isCartOrder && !this.hold) {
    await rp(options);
    await this.updateOrderStatus(4); // shipped
  }
}

orderSchema.methods.customerRq = function() {
	return this.customer.addCustomerRq();
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

  // Shipping and Discounts now only show up on the invoice. not on the sales order.

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

  var paymentMethod3DCart = this.paymentMethod;
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
  var commentArray = this.cartOrder.CustomerComments ? this.cartOrder.CustomerComments.split('\n') : [];
  var comments = '';
  var po = '';
  commentArray.forEach(comment => {
    var code = comment.substring(0, 4);
    if (code == 'PO: ') {
      po = comment.substring(4, 24); // max 20 characters
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
        BillAddress: this.customer.createBillingAddress(),
        ShipAddress : this.createShippingAddress(),
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

orderSchema.methods.calculateSalesTax = async function() {
  await this.populate('customer').execPopulate();
  let salesTax = 0;
  if (this.customer.billingCountry == 'CA') {
    if (this.customer.billingState == 'ON') {
      salesTax = 0.13;
    } else if (this.customer.billingState == 'AB' ||
      this.customer.billingState == 'NU' ||
      this.customer.billingState == 'NT' ||
      this.customer.billingState == 'MB' ||
      this.customer.billingState == 'YT') {
      salesTax = 0.05;
    } else if (this.customer.billingState == 'BC') {
      salesTax = 0.05;
    } else if (this.customer.billingState == 'NB' ||
      this.customer.billingState == 'NL' ||
      this.customer.billingState == 'PE' ||
      this.customer.billingState == 'NS') {
      salesTax = 0.15;
    } else if (this.customer.billingState == 'SK') {
      salesTax = 0.05;
    } else if (this.customer.billingState == 'QC') {
      salesTax = 0.05;
    }
  }
  this.salesTax = salesTax * this.subtotal;
}

orderSchema.methods.createInvoiceRq = function(qbSalesOrder) {
	var invoiceItems = [];

  var lineItems = qbSalesOrder.SalesOrderLineRet;
  if (!Array.isArray(lineItems)) {
    lineItems = [lineItems];
  }

  var items = _.cloneDeep(this.items); // can't edit the item list, in case we save after

  // iterate over the items in the sales order first
  lineItems.forEach(lineItem => {
    console.log(lineItem);
    for (let i = 0; i < items.length; i++) {
      if (lineItem.ItemRef.FullName == items[i].item.sku) {
        invoiceItems.push({
          Quantity: items[i].pickedQuantity,
          SalesTaxCodeRef: lineItem.SalesTaxCodeRef,
          LinkToTxn: {
            TxnID: qbSalesOrder.TxnID,
            TxnLineID: lineItem.TxnLineID
          }
        });
        // we found the item, now we need to remove it, so we don't find it again
        items.splice(i, 1);
        i--;
        break; // no need to continue
      }
    }
  });

  // now anything remaining in items are new, just add them at the end
  items.forEach(item => {
    invoiceItems.push({
      ItemRef: {
        FullName: item.item.sku
      },
      Quantity: item.pickedQuantity,
      Rate: item.price,
      InventorySiteRef: {
        FullName: 'Warehouse'
      }
    });
  });

  invoiceItems.push({
    ItemRef: {
      FullName: 'DISC',
    },
    Desc : 'All discounts on order',
    Rate: this.discount
  });

  invoiceItems.push({
    ItemRef: {
      FullName: 'Shipping & Handling'
    },
    Rate: this.shippingCost
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

orderSchema.methods.createShippingAddress = function() {
  var shippingAddress = {};
  shippingAddress.Addr1 = this.cartOrder.ShipmentList[0].ShipmentFirstName + " " + this.cartOrder.ShipmentList[0].ShipmentLastName;
  if (this.cartOrder.ShipmentList[0].ShipmentCompany) {
    shippingAddress.Addr2 = this.cartOrder.ShipmentList[0].ShipmentCompany.substring(0, 40);
    shippingAddress.Addr3 = this.cartOrder.ShipmentList[0].ShipmentAddress.substring(0, 40);
    if (this.cartOrder.ShipmentList[0].ShipmentAddress2)
      shippingAddress.Addr4 = this.cartOrder.ShipmentList[0].ShipmentAddress2.substring(0, 40);
  } else {
    shippingAddress.Addr2 = this.cartOrder.ShipmentList[0].ShipmentAddress.substring(0, 40);
    if (this.cartOrder.ShipmentList[0].ShipmentAddress2)
      shippingAddress.Addr3 = this.cartOrder.ShipmentList[0].ShipmentAddress2.substring(0, 40);
  }

  shippingAddress.City = this.cartOrder.ShipmentList[0].ShipmentCity.substring(0, 40);
  shippingAddress.State = this.cartOrder.ShipmentList[0].ShipmentState.substring(0, 40);
  shippingAddress.PostalCode = this.cartOrder.ShipmentList[0].ShipmentZipCode.substring(0, 40);
  shippingAddress.Country = this.cartOrder.ShipmentList[0].ShipmentCountry.substring(0, 40);
  return shippingAddress;
}

orderSchema.methods.checkPayment = async function() {
  if (!this.isCartOrder)
    return 'Not a cart order.';
  let cartOrder = await this.get3DCart().get('Orders/'+this.cartOrder.OrderID);
  cartOrder = cartOrder[0];
  console.log(cartOrder.TransactionList);
  cartOrder.TransactionList.forEach(transaction => {
    let newPayment = true;
    let payment = {
      amount: transaction.TransactionAmount,
      reference: transaction.TransactionApproval,
      cartId: transaction.TransactionIndexID,
      type: transaction.TransactionType,
      method: transaction.TransactionMethod
    };
    this.payments.forEach(dbPayment => {
      if (payment.cartId == dbPayment.cartId) {
        newPayment = false;
        dbPayment.amount = payment.amount;
        dbPayment.reference = payment.reference;
        dbPayment.type = payment.type;
        dbPayment.method = payment.method;
      };
    });
    if (newPayment)
      this.payments.push(payment);
  });
  this.paid = this.balance.toFixed(2) <= 0.00;
  return this.save();
}

orderSchema.methods.addPayment = async function(payment) {
  this.payments.push(payment);
  this.paid = this.balance <= 0;
  return this.save();
}

orderSchema.methods.get3DCart = function() {
  if (this.canadian) {
    return new CartMarketplace('https://www.ecstasycrafts.ca', process.env.CART_PRIVATE_KEY, process.env.CART_TOKEN_CANADA);
  }
  return new CartMarketplace('https://www.ecstasycrafts.com', process.env.CART_PRIVATE_KEY, process.env.CART_TOKEN);
}

orderSchema.methods.applyPaymentsToQB = async function(qbws) {
  if (this.flags.paymentsApplied) {
    return 'The payments have already been applied. Check quickbooks';
  }

  let validPayments = this.payments.filter(payment => {
    return payment.type == 'Capture' || payment.type == 'Manual' || payment.type == 'Sale';
  });

  let theOrder = this;
  for (payment of validPayments) {
    let paymentRq = await this.getAddPaymentRq(payment);
    qbws.addRequest(paymentRq, xmlResponse => {
      console.log(xmlResponse);
      theOrder.flags.paymentsApplied = true;
      return theOrder.save();
    });
  }
}

orderSchema.methods.getAddPaymentRq = async function(payment) {
  await this.populate('customer').execPopulate();
  let customerRef = this.customer.lastname + ' ' + this.customer.firstname;

  // An exception for Amazon
  if (this.isCartOrder) {
    if (this.cartOrder.BillingFirstName == 'Amazon') {
      customerRef = 'Amazon';
    } else if (this.cartOrder.BillingFirstName == 'Amazon.') {
      customerRef = 'Amazon. ca';
    }
  }
  
  let receivePaymentAddRq = {
    ReceivePaymentAddRq: {
      '@requestID': 'payment-' + this.orderId,
      ReceivePaymentAdd: {
        CustomerRef: {
          FullName: customerRef
        },
        RefNumber: payment.reference.substring(0, 10),
        TotalAmount: payment.amount.toFixed(2),
        PaymentMethodRef: {
          FullName: payment.method
        },
        Memo: 'EC-Express - ' + payment.method,
        IsAutoApply: true
      }
    }
  };

  var xmlDoc = getXMLRequest(receivePaymentAddRq);
  var str = xmlDoc.end({pretty: true});
  console.log(str);
  return str;
}

// helpers

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