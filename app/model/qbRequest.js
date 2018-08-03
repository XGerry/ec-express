var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var ObjectId = mongoose.Schema.Types.ObjectId;

var qbRequestSchema = new mongoose.Schema({
	request: String,
	completed: Boolean
});

module.exports = mongoose.model('QBRequest', qbRequestSchema);