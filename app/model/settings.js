var mongoose = require('mongoose');

var settingSchema = new mongoose.Schema({
	account: Object,
	companyFile: String
});

module.exports = mongoose.model('Settings', settingSchema);