var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var manifestSchema = new mongoose.Schema({
	lastModified: { type: Date, index: true},
	shipDate: {type: Date, index: true},
	orders: Object,
	totalWeight: Number,
	totalValue: Number,
	totalParcels: Number
});

module.exports = mongoose.model('Manifest', manifestSchema);