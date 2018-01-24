var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var manifestSchema = new mongoose.Schema({
	lastModified: Date,
	shipDate: Date,
	orders: Object,
	totalWeight: Number,
	totalValue: Number,
	totalParcels: Number
});

module.exports = mongoose.model('Manifest', manifestSchema);