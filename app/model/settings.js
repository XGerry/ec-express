var mongoose = require('mongoose');

var settingSchema = new mongoose.Schema({
	account: Object,
	companyFile: String,
	canadianDistribution: Number,
	usDistribution: Number,
	lastImport: Number,
	timecodes: {
		type: [Number],
		default: []
	},
	lastImports: {
		type: [Number],
		default: []
	}
});

module.exports = mongoose.model('Settings', settingSchema);