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
	email: String
});

module.exports = mongoose.model('Customer', customerSchema);