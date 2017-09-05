var mongoose = require('mongoose');

var settingSchema = new mongoose.Schema({
	account: Object,
	companyFile: String,
	canadianDistribution: Number,
	usDistribution: Number
});

module.exports = mongoose.model('Settings', settingSchema);