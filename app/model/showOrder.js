// To be deprecated

var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;

var orderSchema = new mongoose.Schema({
	orderId : String,
	customer: Object,
	showItems: [{
		sku: String,
		quantity: Number,
		message: String,
		total: Number
	}],
	notes: String,
	coupon: String,
	discount: {
		type: Number,
		default: 0
	}
});

module.exports = mongoose.model('ShowOrder', orderSchema);