var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;

var deliverySchema = new mongoose.Schema({
	purchaseOrders: [{
		type: ObjectId,
		ref: 'PurchaseOrder'
	}],
	name: String,
	status: String,
	comments: [{
		comment: String,
		author: String
	}],
	manufacturer: String,
	date: Date,
	poNumber: String
});

module.exports = mongoose.model('Delivery', deliverySchema);