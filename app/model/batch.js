var mongoose = require('mongoose');
var Order = require('./order');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;
let shortid = require('shortid');
var moment = require('moment');

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
	},
	shortid: {
		type: String,
		default: shortid.generate
	}
});

batchSchema.statics.createAutoBatch = function(maxNumberOfItems, maxNumberOfSkus, batchType) {
	var newBatch = new this();
	newBatch.orders = [];
	newBatch.startTime = new Date();
	var query = {picked: false, batch: null, hold: false};

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
	return Order.find(query).populate('customer').sort('orderDate').then(async rushedOrders => {
		console.log('Found ' + rushedOrders.length + ' rush orders');
		if (rushedOrders.length > 0) {
			console.log('adding the rushed order');
			newBatch = await getBatch(rushedOrders, newBatch, maxNumberOfItems, maxNumberOfSkus, 5);
		}

		// now the non-rushed orders
		query.rush = false;
		return Order.find(query).populate('customer').sort('orderDate').then(orders => {
			console.log('Found ' + orders.length + ' unpicked orders');
			return getBatch(orders, newBatch, maxNumberOfItems, maxNumberOfSkus, 5);
		});
	});
}

async function getBatch(orders, batch, maxItems, maxSKUs, maxOrders) {
	if (orders.length == 0 || 
		batch.orders.length >= maxOrders || 
		batch.numberOfItems >= maxItems || 
		batch.maxSKUs >= maxSKUs) {
		return batch.recalculate();
	}

	var order = orders.shift();
	var numberOfSkus = parseInt(order.items.length);
	var numberOfItems = order.numberOfItems;

	var possibleTotalSkus = batch.numberOfSkus + numberOfSkus;
	var possibleTotalItems = batch.numberOfItems + numberOfItems;

	if (batch.orders.length == 0) { // have to add the first one no matter what
		possibleTotalItems = 0;
		possibleTotalSkus = 0;
	}

	if (possibleTotalItems <= maxItems && possibleTotalSkus <= maxSKUs) {
		// add the order
		batch.orders.push(order);
		order.batch = batch._id;
		order.updateOrderStatus(2);

		// now see if there are any other orders from that customer
		for (var j = 0; j < orders.length; j++) {
			if (order.customer.email.toUpperCase() == orders[j].customer.email.toUpperCase()) {
				// another order, automatically add it
				var [dupOrder] = orders.splice(j, 1);
				batch.orders.push(dupOrder);
				dupOrder.batch = batch._id;
				dupOrder.updateOrderStatus(2);
				j--;
			}
		}
		await batch.recalculate();
	}
	return getBatch(orders, batch, maxItems, maxSKUs, maxOrders);
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

batchSchema.methods.reset = function() {
	return this.populate('orders').execPopulate().then(() => {
		var promises = [];
		for (order of this.orders) {
			order.items.forEach(item => {
				item.pickedQuantity = 0;
			});
			promises.push(order.save());
		}
		return Promise.all(promises);
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

batchSchema.methods.finish = async function(batch) {
	this.set(batch);
	this.endTime = new Date();
	this.completed = true;
	await this.save();
	for (order of this.orders) {
		// set the order ship dates automatically
		var now = moment();
		var weekday = now.weekday();
		var hour = now.hour();
		if (weekday == 1 || weekday == 2) { // monday or tuesday
			if (hour < 11) { // ships the same day
				order.shipDate = now;
			} else {
				order.shipDate = moment().add(1, 'day');
			}
		} else if (weekday == 3) { // wednesday
			order.shipDate = moment().day(4); // thursday
		} else if (weekday == 4) {
			if (hour < 11) {
				order.shipDate = now;
			} else {
				order.shipDate = moment().day(1); // this monday
			}
		} else {
			order.shipDate = moment().day(1); // this monday
		}
		order.picked = true;
		order.isNew = false;
		delete order.__v;
		await order.save();
	}
	return this;
}

module.exports = mongoose.model('Batch', batchSchema);