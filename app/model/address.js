var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var addressSchema = new mongoose.Schema({
	ShipmentAddress: String,
	ShipmentAddress2: {
		type: String,
		default: ''
	},
	ShipmentCity: String,
	ShipmentState: String,
	ShipmentZipCode: String,
	ShipmentCountry: String,
	ShipmentCompany: String,
	AddressName: String,
	ShipmentFirstName: String,
	ShipmentLastName: String
});

module.exports = mongoose.model('Address', addressSchema);