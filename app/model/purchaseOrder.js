var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;

var poSchema = new mongoose.Schema({
	delivery: {
		type: ObjectId,
		ref: 'Delivery'
	},
	items: Array,
	name: String,
	inQuickbooks: Boolean,
	poNumber: String,
	manufacturer: String,
	date: Date,
	lastModified: Date
});

module.exports = mongoose.model('PurchaseOrder', poSchema);