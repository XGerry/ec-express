var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;
var request = require('request');
var rp = require('request-promise-native');

var customerSchema = new mongoose.Schema({
	firstname: String,
	lastname: String,
	orders: [{
		type: ObjectId,
		ref: 'Order'
	}],
	email: {
		type: String,
		index: true
	},
	phone: {
		type: String,
		index: true
	},
	companyName: String,
	billingAddress: String,
	billingAddress2: String,
	billingCity: String,
	billingState: String,
	billingCountry: String,
	billingZipCode: String,
	shippingAddress: String,
	shippingAddress2: String,
	shippingCity: String,
	shippingState: String,
	shippingCountry: String,
	shippingZipCode: String,
	customerType: Number,
	customerID: Number // 3D Cart customer id
}, {
	toObject: {
		virtuals: true
	},
	toJSON: {
		virtuals: true
	},
	usePushEach: true
});

customerSchema.virtual('name').get(function() {
	return this.firstname + ' ' + this.lastname;
});

customerSchema.virtual('canadian').get(function() {
	return this.billingCountry == 'CA';
});

customerSchema.statics.createCustomer = function(cartOrder) {
	var newCustomer = new this();
	return newCustomer.updateFrom3DCart(cartOrder);
}

customerSchema.methods.updateFrom3DCart = function(cartOrder) {
	this.email = cartOrder.BillingEmail;
	this.firstname = cartOrder.BillingFirstName;
	this.lastname = cartOrder.BillingLastName;
	this.phone = cartOrder.BillingPhoneNumber;
	this.companyName = cartOrder.BillingCompany;
	this.billingAddress = cartOrder.BillingAddress;
	this.billingAddress = cartOrder.BillingAddress2;
	this.billingCity = cartOrder.BillingCity;
	this.billingState = cartOrder.BillingState;
	this.billingCountry = cartOrder.BillingCountry;
	this.billingZipCode = cartOrder.BillingZipCode;
	this.shippingAddress = cartOrder.ShipmentList[0].ShipmentAddress;
	this.shippingAddress2 = cartOrder.ShipmentList[0].ShipmentAddress2;
	this.shippingCity = cartOrder.ShipmentList[0].ShipmentCity;
	this.shippingState = cartOrder.ShipmentList[0].ShipmentState;
	this.shippingCountry = cartOrder.ShipmentList[0].ShipmentCountry;
	this.customerId = cartOrder.CustomerID;
	return this.save();
}

customerSchema.methods.getCustomerType = function() {
	if (this.customerType == undefined || this.customerType == null) {
		if (this.customerId) {
	    var options = helpers.get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Customers/'+order.cartOrder.CustomerID, 'GET', order.canadian);
      return rp(options).then(response => {
        if (Array.isArray(response)) {
          response = response[0];
        }
        this.customerType = response.CustomerGroupID;
        return this.save();
      });
    } else {
    	return this;
    }
  } else {
  	return this;
  }
}

module.exports = mongoose.model('Customer', customerSchema);