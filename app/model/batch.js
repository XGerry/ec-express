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
		if (rushedOrders.length > 0) {
			newBatch = getBatch(0, rushedOrders, newBatch, maxNumberOfItems, maxNumberOfSkus, 5);
		}

		// now the non-rushed orders
		query.rush = false;
		return Order.find(query).sort('orderDate').then(orders => {
			console.log('Found ' + orders.length + ' unpicked orders');
			return getBatch(0, orders, newBatch, maxNumberOfItems, maxNumberOfSkus, 5);
		});
	});
}

async function getBatch(index, orders, batch, maxItems, maxSKUs, maxOrders) {
	if (index >= orders.length || 
		batch.orders.length >= maxOrders || 
		batch.numberOfItems >= maxItems || 
		batch.maxSKUs >= maxSKUs) {
		return batch.recalculate();
	}

	var order = orders[index];
	var numberOfSkus = parseInt(order.items.length);
	var numberOfItems = order.items.reduce((totalItems, item) => {
		return totalItems + parseInt(item.quantity);
	}, 0);

	var possibleTotalSkus = batch.numberOfSkus + numberOfSkus;
	var possibleTotalItems = batch.numberOfItems + numberOfItems;

	console.log('order: ' + order.email);
	console.log('possible items: ' + possibleTotalItems);
	console.log('possible skus: ' + possibleTotalSkus);

	if (possibleTotalItems <= maxItems && possibleTotalSkus <= maxSKUs) {
		// add the order
		batch.orders.push(order);
		order.batch = batch._id;
		order.updateOrderStatus(2);

		// now see if there are any other orders from that customer
		for (var j = 0; j < orders.length; j++) {
			if (j != index && order.email == orders[j].email) {
				// another order, automatically add it
				batch.orders.push(orders[j]);
				orders[j].batch = batch._id;
				orders[j].updateOrderStatus(2);
			}
		}
		await batch.recalculate();
	}
	console.log('going again: ' + index++);
	return getBatch(index, orders, batch, maxItems, maxSKUs, maxOrders);
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

batchSchema.methods.recalculate = async function() {
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

batchSchema.methods.delete = function() {
	return this.populate('orders').execPopulate().then(() => {
		var promises = [];
		this.orders.forEach(o => {
			promises.push(o.removeBatch());
		});
		return Promise.all(promises).then(() => {
			return this.remove({_id: this._id});
		});
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