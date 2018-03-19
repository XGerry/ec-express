var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;

var customOrderSchema = new mongoose.Schema({
	orderId : String,
	customer: Object,
	items: Array,
	comments: String,
	coupon: String,
	discount: {
		type: Number,
		default: 0
	},
	tax: Number,
	shipping: Number,
	shippingMethod: String
});

module.exports = mongoose.model('CustomOrder', customOrderSchema);