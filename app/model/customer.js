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
	customerId: Number, // 3D Cart customer id
	comments: String
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

customerSchema.statics.createCustomCustomer = function(customer) {
  var newCustomer = new this();
  newCustomer.customerType = customer.profile;
  newCustomer.firstname = customer.firstname;
  newCustomer.lastname = customer.lastname;
  newCustomer.set(customer);
  return newCustomer.save(); 
}

customerSchema.methods.updateFrom3DCart = function(cartOrder) {
	this.email = cartOrder.BillingEmail;
	this.firstname = cartOrder.BillingFirstName;
	this.lastname = cartOrder.BillingLastName;
	this.phone = cartOrder.BillingPhoneNumber;
	this.companyName = cartOrder.BillingCompany;
	this.billingAddress = cartOrder.BillingAddress;
	this.billingAddress2 = cartOrder.BillingAddress2;
	this.billingCity = cartOrder.BillingCity;
	this.billingState = cartOrder.BillingState;
	this.billingCountry = cartOrder.BillingCountry;
	this.billingZipCode = cartOrder.BillingZipCode;
	this.shippingAddress = cartOrder.ShipmentList[0].ShipmentAddress;
	this.shippingAddress2 = cartOrder.ShipmentList[0].ShipmentAddress2;
	this.shippingCity = cartOrder.ShipmentList[0].ShipmentCity;
	this.shippingState = cartOrder.ShipmentList[0].ShipmentState;
	this.shippingZipCode = cartOrder.ShipmentList[0].ShipmentZipCode;
	this.shippingCountry = cartOrder.ShipmentList[0].ShipmentCountry;
	this.customerId = cartOrder.CustomerID;
	return this.save();
}

customerSchema.methods.getCustomerType = function() {
	if (this.customerType == undefined || this.customerType == null) {
		if (this.customerId) {
      console.log('customer id: ' + this.customerId);
      var options = get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Customers/'+this.customerId, 'GET', this.billingCountry == 'CA');
      return rp(options).then(response => {
        if (Array.isArray(response)) {
          response = response[0];
        }
        this.customerType = response.CustomerGroupID;
        return this.save();
      }).catch(err => {
        console.log('Can\'t get the customer type, defaulting to retail');
        this.customerType = 0;
        return this.save();
      });
    } else {
      this.customerType = 0;
      return this.save();
    }
  } else {
    return Promise.resolve(this);
  }
}

customerSchema.methods.addOrder = function(orderId) {
  return mongoose.model('Customer').update({_id: this._id}, {$addToSet: {orders: orderId}});
}

customerSchema.methods.getCustomerFrom3DCart = function() {
  if (this.customerId) {
    var options = get3DCartOptions('https://apirest.3dcart.com/3dCartWebAPI/v1/Customers/'+this.customerId, 'GET', this.billingCountry == 'CA');
    return rp(options).then(response => {
      if (Array.isArray(response)) {
        response = response[0];
      }
      console.log(response);
      this.customerType = response.CustomerGroupID;
      this.email = response.Email;
      this.firstname = response.BillingFirstName;
      this.lastname = response.BillingLastName;
      this.phone = response.BillingPhoneNumber;
      this.companyName = response.BillingCompany;
      this.billingAddress = response.BillingAddress1;
      this.billingAddress2 = response.BillingAddress2;
      this.billingCity = response.BillingCity;
      this.billingState = response.BillingState;
      this.billingCountry = response.BillingCountry;
      this.billingZipCode = response.BillingZipCode;
      this.shippingAddress = response.ShippingAddress1;
      this.shippingAddress2 = response.ShippingAddress2;
      this.shippingCity = response.ShippingCity;
      this.shippingState = response.ShippingState;
      this.shippingZipCode = response.ShippingZipCode;
      this.shippingCountry = response.ShippingCountry;
      return this.save();
    });    
  } else {
    console.log('no customer id');
  }
}

customerSchema.methods.addCustomerRq = async function(order, requestID) {
	console.log('Creating customer ' + this.name);

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
  if (this.billingCountry == 'CA') {
    customerType = 'Canada ';
  }

  if (this.companyName != '') {
    customerType += 'Wholesale';
  } else {
    customerType += 'Retail';
  }
  
  if (order.isCartOrder)
    await this.updateFrom3DCart(order.cartOrder);

  var obj = {
    CustomerAddRq : {
      '@requestID': requestID ? requestID : this.email,
      CustomerAdd : {
        Name : this.lastname + ' ' + this.firstname,
        CompanyName : this.companyName ? this.companyName.substring(0, 40) : '',
        FirstName : this.firstname,
        LastName : this.lastname,
        BillAddress : this.createBillingAddress(),
        ShipAddress : shippingAddress,
        Phone : this.phone,
        Email : this.email,
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
  billingAddress.Addr1 = this.name.substring(0, 40);
  if (this.companyName) {
  	billingAddress.Addr2 = this.companyName.substring(0, 40);
  	billingAddress.Addr3 = this.billingAddress.substring(0, 40);
  	if (this.billingAddress2)
  		billingAddress.Addr4 = this.billingAddress2.substring(0, 40);
  } else {
  	billingAddress.Addr2 = this.billingAddress.substring(0, 40);
  	if (this.billingAddress2)
  		billingAddress.Addr3 = this.billingAddress2.substring(0, 40);
  }

  billingAddress.City = this.billingCity.substring(0, 40);
  billingAddress.State = this.billingState.substring(0, 40);
  billingAddress.PostalCode = this.billingZipCode.substring(0, 40);
  billingAddress.Country = this.billingCountry.substring(0, 40);
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

function get3DCartOptions(url, method, canadian) {
  var options = {
    url: url,
    method: method,
    headers: {
      SecureUrl: 'https://www.ecstasycrafts.' + (canadian ? 'ca' : 'com'),
      PrivateKey: process.env.CART_PRIVATE_KEY,
      Token: canadian ? process.env.CART_TOKEN_CANADA : process.env.CART_TOKEN 
    },
    json: true
  }
  return options;
}

module.exports = mongoose.model('Customer', customerSchema);