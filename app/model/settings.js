var mongoose = require('mongoose');

var settingSchema = new mongoose.Schema({
	account: Object,
	companyFile: String,
	canadianDistribution: Number,
	usDistribution: Number,
	lastImport: Number,
	timecodes: [Number],
	lastImports : Number
});

module.exports = mongoose.model('Settings', settingSchema);