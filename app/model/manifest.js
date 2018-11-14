var mongoose = require('mongoose');
var moment = require('moment');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;

var manifestSchema = new mongoose.Schema({
	lastModified: { type: Date, index: true},
	shipDate: {type: Date, index: true},
	orders: Object,
	totalWeight: Number,
	totalValue: Number,
	totalParcels: Number
});

manifestSchema.statics.createManifest = function(shipDate) {
	var startDate = moment(shipDate).utc().startOf('day');
	var endDate = moment(shipDate).utc().endOf('day');

	return mongoose.model('Order').find({shipDate: {$gte: startDate.toDate(), $lt: endDate.toDate()}}).then(orders => {
		var newManifest = new this();
		newManifest.shipDate = startDate;
		console.log('found ' + orders.length + ' orders with that ship date');
		orders.forEach(order => {
			newManifest.orders.push(order._id);
		});
		return newManifest.save();
	});
}

manifestSchema.statics.findManifest = function(shipDate) {
	var startDate = moment(shipDate).utc().startOf('day');
	var endDate = moment(shipDate).utc().endOf('day');
	return this.findOne({shipDate: {$gte: startDate, $lt: endDate}}).populate('orders').populate('orders.items.item');
}

module.exports = mongoose.model('Manifest', manifestSchema);