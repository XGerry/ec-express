var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;

var orderSchema = new mongoose.Schema({
	cartOrder : Object,
	items: [{
		type: ObjectId,
		ref: 'Item'
	}],
	name : String,
	orderId : String,
	imported : Boolean,
	requestId : Number,
	message : String,
	qbRequest : String,
	completed: Boolean,
	timecode: Number,
	retry: Boolean,
	canadian: Boolean,
	manual: Boolean
}, {
	usePushEach: true
});

module.exports = mongoose.model('Order', orderSchema);