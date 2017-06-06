var mongoose = require('mongoose');

var reportSchema = new mongoose.Schema({
	name : String,
	invoices : Object,
	items : Object,
	inventory : Object
});

module.exports = mongoose.model('Report', reportSchema);