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

batchSchema.statics.createAutoBatch = function(maxNumberOfItems, maxNumberOfSkus, batchType) {
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

	var query = {picked: false, batch: {$exists:false}};

	if (batchType == 'ca') {
		query.canadian = true;
	} else if (batchType == 'us') {
		query.canadian = false;
		query.$or = [{amazon: false}, {amazon: {$exists: false}}];
	} else if (batchType == 'az') {
		query.amazon = true;
	}

	console.log(query);
	return Order.find(query).sort('orderDate').then(orders => {
		console.log('Found ' + orders.length + ' unpicked orders');
		if (orders.length > 0) {
			// Add the first order to the batch to start it off
			var firstOrder = orders.shift();
			newBatch.orders.push(firstOrder._id);
			firstOrder.batch = newBatch._id;
			firstOrder.save();
			newBatch.numberOfSkus = firstOrder.items.length;
			newBatch.numberOfItems = firstOrder.items.reduce((total, item) => {
				return total + item.quantity;
			}, 0);
			orders.forEach(o => addOrderToBatch(o));
			return newBatch.save();
		
}	});
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