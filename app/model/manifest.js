var mongoose = require('mongoose');

var manifestSchema = new mongoose.Schema({
	name : String,
	createdDate: Date,
	orders: [Object],
	totalWeight: Number,
	totalValue: Number,
	totalParcels: Number
});

module.exports = mongoose.model('Manifest', manifestSchema);