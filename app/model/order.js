var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;

var orderSchema = new mongoose.Schema({
	cartOrder : Object,
	items: {
		type: ObjectId,
		ref: 'Item'
	},
	name : String,
	orderId : String,
	imported : Boolean,
	requestId : Number,
	errorMessage : String,
	qbRequest : String,
	completed: Boolean,
	timecode: Number,
	retry: Boolean,
	canadian: Boolean
});

module.exports = mongoose.model('Order', orderSchema);