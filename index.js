var express = require('express');
var request = require('request');
var cors = require('cors');
var qbws = require('qbws');
var bodyParser = require('body-parser');
var builder = require('xmlbuilder');
var xmlParser = require('xml2js').parseString; 

var app = express();

// prepare server
app.use(cors({
  origin : 'https://www.ecstasycrafts.com',
  optionsSuccessStatus : 200
}));
app.use('/', express.static(__dirname + '/client'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css')); // redirect CSS bootstrap

// application/json parser
var jsonParser = bodyParser.json();

// application/x-www-form-urlencoded
var formParser = bodyParser.urlencoded();

var ordersFromQuickbooks = {};

app.listen(process.env.PORT || 3000, function() {
  console.log('EC-Express running on port 3000');
  qbws.run();
});

app.post('/contact', formParser, function (req, res) {
  if (!req.body) {
    return res.sendStatus(400);
  }

  console.log('Creating a new contact to send to Hubspot.');
  console.log(req.body);
  console.log('Firstname: ' + req.body.firstname);
  console.log('Lastname: ' + req.body.lastname);
  console.log('Email: ' + req.body.email);

  createContactHubspot(req.body);
  res.send('Creating contact in hubspot');
});

app.get('/api/create/contact', function (req, res) {
  var contact = {
    firstname : 'Matt',
    lastname : 'Oskamp',
    email : 'mattoskamp@gmail.com'
  };

  createContactHubspot(contact);
  res.send('Sent request to hubspot');
});

app.get('/api/orders', function (req, res) {
  var options = {
    url : 'https://apirest.3dcart.com/3dCartWebAPI/v1/Orders',
    headers : {
      SecureUrl : 'https://www.ecstasycrafts.com',
      PrivateKey : 'de3facfbc2253b63736cf0511306f8f0',
      Token : '1f1a413aee6e983c616b0af7921f2afe'
    },
    qs : {
      limit : req.query.limit != '' ? req.query.limit : 200,
      orderstatus : req.query.status, // Status of New = 1
      datestart : req.query.startDate,
      dateend : req.query.endDate
    }
  }

  request.get(options, function (error, response, body) {
    var responseObject = {};

    if (error) {
      console.log(error + response);
      responseObject.success = false;
      responseObject.message = error;
    } else {
      var jsonBody = JSON.parse(body);
      console.log('Received ' + jsonBody.length + ' orders from 3D Cart');
      responseObject.success = true;
      responseObject.message = 'Received ' + jsonBody.length + ' orders from 3D Cart.'
      responseObject.response = jsonBody;

      requestNumber = 0;
      jsonBody.forEach(function (order) {
        addCustomerToQuickBooks(order, requestNumber++);
        addOrderToQuickBooks(order, requestNumber++);
      });
    }

    res.send(responseObject);
  });
});

app.get('/api/invoices', function (req, res) {
  console.log('Sending a query to QBWC');
  var invoiceQuery = {
    InvoiceQueryRq : {
      '@requestID' : '1',
      MaxReturned : '2',
      TxnDateRangeFilter : {
        FromTxnDate : '2017-03-01',
        ToTxnDate : '2017-03-10'
      },
      IncludeLineItems : true
    }
  };

  var request = getXMLRequest(invoiceQuery);
  qbws.addRequest(request);
  qbws.setCallback(function (response) {
    console.log('received response');

    xmlParser(response, {explicitArray: false}, function(err, result) {
      ordersFromQuickbooks = result;
    });
  });

  res.send('Now run the QBWC on your machine.');
});

app.get('/api/buildManifest', function (req, res) {
  var responseObject = {
    response : '',
    success : false,
    message : ''
  };

  if (!ordersFromQuickbooks) {
    responseObject.success = false;
    responseObject.response = '';
    responseObject.message = 'Error getting the orders from QuickBooks. Make sure you run the WebConnector.';
    res.send(responseObject);
    return;
  }

  responseObject.success = true;
  responseObject.response = ordersFromQuickbooks;
  responseObject.message = 'Successfully got the orders from QuickBooks.';
  res.send(responseObject);
});

app.get('/test', function (req, res) {
  qbws.buildRequest();
  res.send('Added invoice to the queue.');
});

// helpers
function createContactHubspot(contact) {
  var options = {
    url : 'https://forms.hubspot.com/uploads/form/v2/2759836/26c3d878-3647-43ff-a3b7-642b59245fa1',
    form : contact
  };

  request.post(options, function (error, response) {
    if (error) {
      console.log(error);
      console.log(response);
    }
    console.log("Done.");
  });
}

function getXMLRequest(request) {
  var xmlDoc = builder.create('QBXML', { version: '1.0'})
        .instructionBefore('qbxml', 'version="13.0"')
        .ele('QBXMLMsgsRq', { 'onError': 'continueOnError' });
  xmlDoc.ele(request);
  return xmlDoc;
}

function createShippingAddress(order) {
  var shippingAddress = {};
  shippingAddress.Addr1 = order.ShipmentList[0].ShipmentFirstName + " " + order.ShipmentList[0].ShipmentLastName;
  shippingAddress.Addr2 = order.ShipmentList[0].ShipmentCompany;
  shippingAddress.Addr3 = order.ShipmentList[0].ShipmentAddress;
  shippingAddress.Addr4 = order.ShipmentList[0].ShipmentAddress2;
  shippingAddress.City = order.ShipmentList[0].ShipmentCity;
  shippingAddress.State = order.ShipmentList[0].ShipmentState;
  shippingAddress.PostalCode = order.ShipmentList[0].ShipmentZipCode;
  shippingAddress.Country = order.ShipmentList[0].ShipmentCountry;
  return shippingAddress;
}

function addCustomerToQuickBooks(order, requestID) {
  console.log('Creating customer ' + order.BillingFirstName);

  var obj = {
    CustomerAddRq : {
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
        ShipAddress : createShippingAddress(order),
        Phone : order.BillingPhoneNumber,
        Email : order.BillingEmail
      }
    }
  }

  var xmlDoc = getXMLRequest(obj);
  qbws.addRequest(xmlDoc);
}

function addOrderToQuickBooks(order, requestID) {
  console.log('Creating invoice for ' + order.BillingFirstName + ' ' + order.BillingLastName);
  
  // generate the json object for the line orders
  var invoiceAdds = [];
  order.OrderItemList.forEach(function (item) {
    invoiceAdds.push({
      ItemRef : {
        FullName : item.ItemID
      },
      Quantity : item.ItemQuantity,
      Rate : item.ItemUnitPrice
    });
  });

  // look for any discounts in the order
  order.PromotionList.forEach(function (item) {
    invoiceAdds.push({
      ItemRef : {
        FullName : "DISC"
      },
      Desc : item.PromotionName,
      Rate: item.DiscountAmount
    });
  });  

  // add the shipping cost as a line item
  invoiceAdds.push({
    ItemRef : {
      FullName : "Shipping & Handling"
    },
    Quantity : order.ShipmentList[0].ShipmentCost
  });

  // we need to add a surcharge if they are a Canadian customer
  var country = order.ShipmentList[0].ShipmentCountry;
  if (country === "CA" || country === "Canada") {
    invoiceAdds.push({
      ItemRef : {
        FullName : "Subtotal"
      }
    });
    invoiceAdds.push({
      ItemRef : {
        FullName : "Surcharge"
      },
      Quantity : 10
    });
  }

  var shippingMethod = order.ShipmentList[0].ShipmentMethodName.slice(0,15);
  console.log('SHIPPING METHOD: ' + shippingMethod);
  shippingMethod = shippingMethod != '' ? shippingMethod : 'cheapest way'; // default for now

  var obj = {
    InvoiceAddRq : {
      '@requestID' : requestID,
      InvoiceAdd : {
        CustomerRef : {
          FullName : order.BillingCompany != '' ? order.BillingCompany : order.BillingLastName + ' ' + order.BillingFirstName 
        },
        TxnDate : order.OrderDate.slice(0,10), // had to remove the T from the DateTime - maybe this is dangerous?
        RefNumber : order.InvoiceNumberPrefix + order.InvoiceNumber,
        ShipAddress : createShippingAddress(order),
        TermsRef : {
          FullName : 'Online Credit Card' // order.BillingPaymentMethod
        },
        ShipMethodRef : {
          FullName : order.ShipmentList[0].ShipmentMethodName.slice(0,15)
        },
        Memo : 'This is a test import from the API',
        InvoiceLineAdd : invoiceAdds
      }
    }
  };
  var xmlDoc = getXMLRequest(obj);
  qbws.addRequest(xmlDoc);
}