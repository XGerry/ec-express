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
	},
	customOrderNumber: {
		type: Number,
		default: 10000
	}
}, {
	usePushEach: true
});

settingSchema.statics.getNextOrderNumber = function() {
	return this.findOne({}).then(async settings => {
		settings.customOrderNumber++;
		await settings.save();
		return settings.customOrderNumber;
	});
}

module.exports = mongoose.model('Settings', settingSchema);