var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;

var customerSchema = new mongoose.Schema({
	firstname: String,
	lastname: String,
	contestEntries: {
		type: Number,
		default: 0
	},
	lastOrderDate: Date,
	orders: [{
		type: ObjectId,
		ref: 'Order'
	}],
	email: String,
	phone: String,
	billingAddress: String,
	billingAddress2: String,
	billingCity: String,
	billingState: String,
	billingCountry: String,
	billingZipCode: String,
	shippingAddress: String,
	shippingAddress2: String,
	shippingCity: String,
	shippingState: String,
	shippingCountry: String,
	shippingZipCode: String,
	defaultProfile: String,
	defaultWebsite: String
});

module.exports = mongoose.model('Customer', customerSchema);