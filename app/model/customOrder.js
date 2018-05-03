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
	discountType: String,
	discountValue: Number,
	tax: Number,
	shipping: Number,
	shippingMethod: String,
	poNumber: String,
	invoiceNumber: String,
	lastModified: Date,
	createdDate: Date
});

module.exports = mongoose.model('CustomOrder', customOrderSchema);