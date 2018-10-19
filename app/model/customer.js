var mongoose = require('mongoose');
var ObjectId = mongoose.Schema.Types.ObjectId;
var builder = require('xmlbuilder');
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

customerSchema.methods.addCustomerRq = function(order) {
	console.log('Creating customer ' + order.name);

  // figure out what tax code they will get based on their billing address
  var shippingAddress = order.createShippingAddress();
  var taxCode = 'NON';
  if (shippingAddress.Country == 'CA') {
    if (shippingAddress.State == 'ON' || 
      shippingAddress.State == 'NL' || 
      shippingAddress.State == 'NB') {
      taxCode = 'H';
    } else if (shippingAddress.State == 'AB' ||
      shippingAddress.State == 'SK' ||
      shippingAddress.State == 'QC' ||
      shippingAddress.State == 'BC' ||
      shippingAddress.State == 'YT' ||
      shippingAddress.State == 'NU' ||
      shippingAddress.State == 'NT' ||
      shippingAddress.State == 'MB') {
      taxCode = 'G';
    } else if (shippingAddress.State == 'NS') {
      taxCode = 'NS';
    } else if (shippingAddress.State == 'PE') {
      taxCode = 'PEI';
    }
  }

  var customerType = 'US '; // default
  if (order.BillingCountry == 'CA') {
    customerType = 'Canada ';
  }

  if (order.BillingCompany && order.BillingCompany != '') {
    customerType += 'Wholesale';
  } else {
    customerType += 'Retail';
  }

  // var customerName = order.BillingLastName + ' ' + order.BillingFirstName;
  // if (order.BillingCompany && order.BillingCompany != '') {
  //   customerName = order.BillingCompany;
  // }

  var obj = {
    CustomerAddRq : {
      '@requestID' : requestID,
      CustomerAdd : {
        Name : order.BillingLastName + ' ' + order.BillingFirstName,
        CompanyName : order.BillingCompany,
        FirstName : order.BillingFirstName,
        LastName : order.BillingLastName,
        BillAddress : {
          Addr1 : order.BillingLastName + ' ' + order.BillingFirstName,
          Addr2 : order.BillingCompany,
          Addr3 : order.BillingAddress,
          Addr4 : order.BillingAddress2,
          City : order.BillingCity,
          State : order.BillingState,
          PostalCode : order.BillingZipCode,
          Country : order.BillingCountry
        },
        ShipAddress : shippingAddress,
        Phone : order.BillingPhoneNumber,
        Email : order.BillingEmail,
        CustomerTypeRef: {
          FullName: customerType
        },
        SalesTaxCodeRef : {
          FullName : taxCode
        }
      }
    }
  }

  var xmlDoc = getXMLRequest(obj);
  var str = xmlDoc.end({'pretty' : true});
  return str;
}

customerSchema.methods.createBillingAddress = function() {
	var billingAddress = {};
  billingAddress.Addr1 = this.name;
  billingAddress.Addr2 = this.companyName;
  billingAddress.Addr3 = this.billingAddress;
  billingAddress.Addr4 = this.billingAddress2;
  billingAddress.City = this.billingCity;
  billingAddress.State = this.billingState;
  billingAddress.PostalCode = this.billingZipCode;
  billingAddress.Country = this.billingCountry;
  return billingAddress;
}

// helpers

function getXMLRequest(request) {
  var xmlDoc = builder.create('QBXML', { version: '1.0', encoding: 'ISO-8859-1'})
  .instructionBefore('qbxml', 'version="13.0"')
  .ele('QBXMLMsgsRq', { 'onError': 'continueOnError' });
  xmlDoc.ele(request);
  return xmlDoc;
}

module.exports = mongoose.model('Customer', customerSchema);