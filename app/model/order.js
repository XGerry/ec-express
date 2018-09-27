var mongoose = require('mongoose');
var request = require('request');
var rp = require('request-promise-native');
var Item = require('./item');
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
	name: String,
	email: String,
	orderId : String,
	requestId : Number,
	message : String,
	timecode: Number,
	orderValue: Number,
	orderDate: Date,
	manual: Boolean,
	retry: Boolean, // the order is being imported again
	canadian: Boolean, // the order is canadian
	amazon: Boolean,
	imported : Boolean, // the order has been imported as a sales order in quickbooks
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
	}
}, {
	usePushEach: true
});

orderSchema.methods.updateFrom3DCart = function(cartOrder) {
	this.name = cartOrder.BillingFirstName + ' ' + cartOrder.BillingLastName;
  this.cartOrder = cartOrder;
  this.canadian = cartOrder.InvoiceNumberPrefix == 'CA-';
  this.amazon = cartOrder.InvoiceNumberPrefix == 'AZ-';
  this.orderDate = new Date(cartOrder.OrderDate);
  this.markModified('cartOrder');
  this.orderValue = cartOrder.OrderAmount;
  this.email = cartOrder.BillingEmail;
  var promises = [];
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
  	return this.save();
  });
}

orderSchema.methods.updateOrder = function(order) {
	this.set(order);
	var oldOrder = this.cartOrder;
	// replace the items
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

	delete oldOrder.PaymentTokenID; // 3D Cart Doesn't like it when you send this
	this.markModified('cartOrder');
	return this.save();
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

module.exports = mongoose.model('Order', orderSchema);