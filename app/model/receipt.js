var mongoose = require('mongoose');

var receiptSchema = new mongoose.Schema({
	id: String,
	qbObj: Object
});

module.exports = mongoose.model('Receipt', receiptSchema);