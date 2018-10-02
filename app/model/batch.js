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
			order.save().then(o => {
				o.updateOrderStatus(2); // Processing
			});
		}
	}

	var query = {picked: false, batch: null};

	if (batchType == 'ca') {
		query.canadian = true;
	} else if (batchType == 'us') {
		query.canadian = false;
		query.$or = [{amazon: false}, {amazon: {$exists: false}}];
	} else if (batchType == 'az') {
		query.amazon = true;
	}

	return Order.find(query).sort('orderDate').then(orders => {
		console.log('Found ' + orders.length + ' unpicked orders');
		if (orders.length > 0) {
			// Add the first order to the batch to start it off
			var firstOrder = orders.shift();
			newBatch.orders.push(firstOrder._id);
			firstOrder.batch = newBatch._id;
			firstOrder.updateOrderStatus(2);
			newBatch.numberOfSkus = firstOrder.items.length;
			newBatch.numberOfItems = firstOrder.items.reduce((total, item) => {
				return total + item.quantity;
			}, 0);
			orders.forEach(o => addOrderToBatch(o));
			return newBatch.save();
		}	
	});
}

batchSchema.statics.createCustomBatch = function(orderIds) {
	var newBatch = new this();
	newBatch.startTime = new Date();

	return Order.find({_id: {$in: orderIds}}).then(orders => {
		console.log(orders.length);
		orders.forEach(order => {
			var numberOfSkus = parseInt(order.items.length);
			var numberOfItems = order.items.reduce((totalItems, item) => {
				return totalItems + parseInt(item.quantity);
			}, 0);

			newBatch.orders.push(order._id);
			newBatch.numberOfItems += numberOfItems;
			newBatch.numberOfSkus += numberOfSkus;
			order.batch = newBatch._id;
			order.save().then(o => {
				o.updateOrderStatus(2); // Processing
			});
		});

		return newBatch.save();
	});
}

batchSchema.methods.removeOrder = function(orderId) {
	console.log(this.orders);
	this.orders.splice(orders.indexOf(orderId), 1);
	return this.save();
}

batchSchema.methods.finish = function(batch) {
	this.set(batch);
	this.endTime = new Date();
	this.completed = true;

	this.orders.forEach(order => {
		order.picked = true;
		order.isNew = false;
		order.save().then(o => {
			o.updateOrderStatus(9); // Processing Payment
		});
	});

	return this.save();
}

module.exports = mongoose.model('Batch', batchSchema);