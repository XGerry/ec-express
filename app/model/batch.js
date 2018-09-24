var mongoose = require('mongoose');
var Order = require('./order');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;

var batchSchema = new mongoose.Schema({
	orders: [{
		type: ObjectId,
		ref: 'Order'
	}],
	completed: {
		type: Boolean,
		default: false
	},
	startTime: Date,
	endTime: Date,
	numberOfItems: {
		type: Number,
		default: 0
	},
	numberOfSkus: {
		type: Number,
		default: 0
	}
});

batchSchema.statics.createAutoBatch = function(maxNumberOfItems, maxNumberOfSkus) {
	var newBatch = new this();
	newBatch.startTime = new Date();

	function addOrderToBatch(order) {
		var numberOfSkus = parseInt(order.items.length);
		var numberOfItems = order.items.reduce((totalItems, item) => {
			return totalItems + parseInt(item.quantity);
		}, 0);

		var possibleTotalSkus = newBatch.numberOfSkus + numberOfSkus;
		var possibleTotalItems = newBatch.numberOfItems + numberOfItems;

		if (possibleTotalSkus < maxNumberOfSkus && possibleTotalItems < maxNumberOfItems) {
			newBatch.orders.push(order._id);
			newBatch.numberOfItems = possibleTotalItems;
			newBatch.numberOfSkus = possibleTotalSkus;
			order.batch = newBatch._id;
			order.save();
		}
	}

	return Order.find({picked: false, batch: {$exists:false}}).sort('orderDate').then(orders => {
		console.log('Found ' + orders.length + ' unpicked orders');
		orders.forEach(o => addOrderToBatch(o));
		if (newBatch.orders.length == 0) {
			newBatch.orders.push(orders[0]._id);
			orders[0].batch = newBatch._id;
			orders[0].save();
			newBatch.numberOfSkus = orders[0].items.length;
			newBatch.numberOfItems = orders[0].items.reduce((total, item) => {
				return total + item.quantity;
			}, 0);
		}
		return newBatch.save();
	});
}

batchSchema.methods.finish = function(batch) {
	this.set(batch);
	this.endTime = new Date();
	this.completed = true;

	this.orders.forEach(order => {
		order.picked = true;
		order.isNew = false;
		order.save();
	});

	return this.save();
}

module.exports = mongoose.model('Batch', batchSchema);