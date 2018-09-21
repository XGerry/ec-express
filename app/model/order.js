var mongoose = require('mongoose');
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
		}
	}],
	name : String,
	orderId : String,
	imported : Boolean,
	requestId : Number,
	message : String,
	completed: {
		type: Boolean,
		default: false
	},
	timecode: Number,
	retry: Boolean,
	canadian: Boolean,
	manual: Boolean,
	orderValue: Number,
	picked: {
		type: Boolean,
		default: false
	},
	orderDate: Date
}, {
	usePushEach: true
});

orderSchema.methods.updateFrom3DCart = function(cartOrder) {
	this.name = cartOrder.BillingFirstName + ' ' + cartOrder.BillingLastName;
  this.cartOrder = cartOrder;
  this.canadian = cartOrder.InvoiceNumberPrefix == 'CA-';
  this.orderDate = new Date(cartOrder.OrderDate);
  this.markModified('cartOrder');
  this.orderValue = cartOrder.OrderAmount;
  var promises = [];
  this.items = [];
  cartOrder.OrderItemList.forEach(item => {
  	var sku = item.ItemID.trim();
  	var findItem = Item.findOne({sku: sku}).then(dbItem => {
  		if (dbItem) {
		  	this.items.push({
		  		item: dbItem._id,
		  		quantity: item.ItemQuantity,
		  		pickedQuantity: 0
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