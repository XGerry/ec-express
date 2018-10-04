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

	async function addOrderToBatch(order) {
		var numberOfSkus = parseInt(order.items.length);
		var numberOfItems = order.items.reduce((totalItems, item) => {
			return totalItems + parseInt(item.quantity);
		}, 0);

		var possibleTotalSkus = newBatch.numberOfSkus + numberOfSkus;
		var possibleTotalItems = newBatch.numberOfItems + numberOfItems;

		if (possibleTotalSkus < maxNumberOfSkus && possibleTotalItems < maxNumberOfItems) {
			newBatch.orders.push(order._id);
			order.batch = newBatch._id;
			order.updateOrderStatus(2); // Processing
			return newBatch.recalculate();
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

	// first add any orders that need to be rushed
	query.rush = true;

	return Order.find(query).sort('orderDate').then(rushedOrders => {
		console.log('Found ' + rushedOrders.length + ' rush orders');
		var promises = [];
		if (rushedOrders.length > 0) {
			// add the first order
			var firstRushedOrder = rushedOrders.shift();
			newBatch.orders.push(firstRushedOrder._id);
			firstRushedOrder.batch = newBatch._id;
			firstRushedOrder.updateOrderStatus(2);
			promises.add(newBatch.recalculate());
		}
		return Promise.all(promises).then(async () => {
			for (order of rushedOrders) {
				await addOrderToBatch(order);
			}
			// now the non-rushed orders
			delete query.rush;
			return Order.find(query).sort('orderDate').then(orders => {
				console.log('Found ' + orders.length + ' unpicked orders');
				if (orders.length > 0) {
					if (newBatch.orders.length == 0) {
						var firstOrder = orders.shift();
						newBatch.orders.push(firstOrder._id);
						firstOrder.batch = newBatch._id;
						firstOrder.updateOrderStatus(2);
					}
					return newBatch.recalculate().then(async () => {
						for (order of orders) {
							await addOrderToBatch(order);
						}
						return newBatch.save();
					});
				}	
			});
		});
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
	var index = this.orders.indexOf(orderId);
	if (index >= 0) {
		this.orders.splice(index, 1);
	}
	return this.recalculate();
}

batchSchema.methods.recalculate = function() {
	return this.populate('orders').execPopulate().then(() => {
		this.numberOfItems = 0;
		this.numberOfSkus = 0;
		this.orders.forEach(o => {
			this.numberOfSkus += o.items.length;
			this.numberOfItems += o.items.reduce((totalItems, item) => {
				return totalItems + parseInt(item.quantity);
			}, 0);
		});
		return this.save();
	});
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