// var http = require('http');
var soap = require('soap');
var chalk = require('chalk');
var fs = require('fs');
var builder = require('xmlbuilder');
var uuid = require('uuid');
var xmlParser = require('xml2js').parseString; 
var xml2js = require('xml2js-es6-promise');
var Order = require('../app/model/order');
var Settings = require('../app/model/settings');
var helpers = require('../app/helpers.js');
var async = require('async');

var qbws,
    server,
    counter = null,
    connectionErrCounter = null,
    errors = [],
    username = 'username',
    password = 'password',
    // Change companyFile to an empty string to use the company file
    //     currently open in Quickbooks
    companyFile = 'C:\\Users\\Public\\Documents\\Intuit\\QuickBooks\\Company Files\\ECCrafts-2018.QBW',
    req = [],
    orders = [],
    finalCallbacks = [];
var currentRequest = {};
var startingCallbacks = [];

/**
 * Returns an array of sample QBXML requests
 * @returns {String|Array} QBXML requests: CustomerQuery, InvoiceQuery and BillQuery
 */
function buildRequest() {
    // TODO: is 'pretty' false by default? Probably.
        var strRequestXML,
        inputXMLDoc,
        request = [];
    /*
    // CustomerQuery
    inputXMLDoc = builder.create('QBXML', { version: '1.0' })
              .instruction('qbxml', 'version="4.0"')
              .ele('QBXMLMsgsRq', { 'onError': 'stopOnError' })
                  .ele('CustomerQueryRq', { 'requestID': '1' })
                      .ele('MaxReturned')
                          .text('1');
    strRequestXML = inputXMLDoc.end({ 'pretty': false });
    request.push(strRequestXML);
    */
    // clean up1
    strRequestXML = '';
    inputXMLDoc = null;

    // InvoiceQuery
    inputXMLDoc = builder.create('QBXML', { version: '1.0' })
              .instruction('qbxml', 'version="4.0"')
              .ele('QBXMLMsgsRq', { 'onError': 'stopOnError' })
                  .ele('InvoiceQueryRq', { 'requestID': '2' })
                      .ele('MaxReturned')
                          .text('1');
    strRequestXML = inputXMLDoc.end({ 'pretty': true });
    request.push(strRequestXML);
    console.log(strRequestXML);

    // clean up
    strRequestXML = '';
    inputXMLDoc = null;
    /*

    // BillQuery
    inputXMLDoc = builder.create('QBXML', { version: '1.0' })
              .instruction('qbxml', 'version="4.0"')
              .ele('QBXMLMsgsRq', { 'onError': 'stopOnError' })
                  .ele('BillQueryRq', { 'requestID': '3' })
                      .ele('MaxReturned')
                          .text('1');
    strRequestXML = inputXMLDoc.end({ 'pretty': false });
    request.push(strRequestXML);
    */
    
    /*
    // Create Customer Request
    inputXMLDoc = builder.create('QBXML', { version: '1.0'})
        .instruction('qbxml', 'version="4.0"')
        .ele('QBXMLMsgsRq', { 'onError': 'stopOnError' })
        .ele('CustomerAddRq', {'requestID' : '4' })
        .ele('CustomerAdd')
            .ele('Name','AF Cider - New').up()
            .ele('FirstName','Matty').up()
            .ele('LastName','Oskamp').up()
            .ele('BillAddress')
            .ele('Addr1', '1922 Berrywood Cres').up()
            .ele('City', 'Kingston').up()
            .ele('State', 'Ontario').up()
            .ele('PostalCode', 'K7P3G9').up()
            .ele('Country', 'Canada').up().up()
            .ele('Phone', '613-242-8433').up()
            .ele('Email', 'matt@applefallscider.ca').up()
            .ele('Contact', 'Maddy Ozzy');
    

    // Creating an Invoice Request
    inputXMLDoc = builder.create('QBXML', { version: '1.0'})
        .instruction('qbxml', 'version="4.0"')
        .ele('QBXMLMsgsRq', { 'onError': 'stopOnError' });

    var invoiceAddRq = {
        'InvoiceAddRq' : {
            '@requestID' : '5.0',
            'InvoiceAdd' : {
                'CustomerRef' : {
                    'FullName' : 'Oskamp Matthew'
                },
                'TxnDate' : '2017-04-27',
                'RefNumber' : 'TST-0001',
                'TermsRef' : {
                    'FullName' : 'Net 30'
                },
                'SalesRepRef' : {
                    'FullName' : 'DO'
                },
                'Memo' : 'This is a test',
                'InvoiceLineAdd' : {
                    'ItemRef' : {
                        'FullName' : 'T01'
                    },
                    'Desc' : 'Test item description',
                    'Quantity' : '1.00000',
                    'Rate' : '15.00000'
                },
                'InvoiceLineAdd' : {
                    'ItemRef' : {
                        'FullName' : 'Shipping -Cana'
                    },
                    'Desc' : 'Test item description',
                    'Quantity' : '5.00000',
                    'Rate' : '5.00000'
                },
                'InvoiceLineAdd' : {
                    'ItemRef' : {
                        'FullName' : 'Surcharge'
                    },
                }
            }
        }
    }

    inputXMLDoc.ele(invoiceAddRq);

    strRequestXML = inputXMLDoc.end({'pretty' : true});
    console.log(strRequestXML);
    request.push(strRequestXML);
    */
    req = request;
    return request;
}

var addRequest = function(str, fncs, unique) {
  var arrayOfCallbacks = [];
  if (!Array.isArray(fncs)) {
    if (fncs) {
      arrayOfCallbacks.push(fncs);
    }
  } else {
    arrayOfCallbacks.concat(fncs);
  }
  if (unique) {
    var foundDup = false;
    req.forEach(requestObject => {
      if (requestObject.xml == str) { // duplicate
        foundDup = true;
        requestObject.callbacks = arrayOfCallbacks; // overwrite callbacks
      }
    });
    if (!foundDup) {
      req.push({
        xml: str,
        callbacks: arrayOfCallbacks
      });
    }
  } else {
    req.push({
      xml: str,
      callbacks: arrayOfCallbacks
    });
  }
}

function addStartingCallback(fnc) {
  startingCallbacks.push(fnc);
}

function removeOrder(index) {
  if (index > -1)
    orders.splice(index, 1);
}

var clearRequests = function() {
  // req = []; // not needed now. This should be empty if we are finished
  orders = [];
  connectionErrCounter = 0; // reset this too
  finalCallbacks = [];
  startingCallbacks = [];
}

function addFinalCallback(fnc) {
  finalCallbacks.push(fnc);
}

function getOrders() {
  return orders;
}

function generateOrderRequest() {
  var promises = [];
  var requestNumber = 1;
  return Order.find({imported: false}).then(orders => {
    orders.forEach(order => {
      addRequest(helpers.addCustomerRq(order.cartOrder, requestNumber++));
      var invoiceRqId = order.orderId;
      var xmlInvoiceRequest = helpers.addSalesOrderRq(order.cartOrder);
      addRequest(xmlInvoiceRequest, checkError, true); // make sure this only happens once
      order.requestID = invoiceRqId;
      promises.push(order.save());
    });
    return Promise.all(promises);
  });
}

function checkError(response) {
  return xml2js(response, {explicitArray: false}).then(result => {
    var invoiceRs = result.QBXML.QBXMLMsgsRs.InvoiceAddRs;
    if (invoiceRs) {
      var requestID = invoiceRs.$.requestID;
      return Order.findOne({ orderId : requestID }).then(doc => {
        if (doc) {
          if (invoiceRs.$.statusCode == '3140' || 
              invoiceRs.$.statusCode == '3205' || 
              invoiceRs.$.statusCode == '3070' || 
              invoiceRs.$.statusCode == '3045') { // error
            doc.imported = false;
            doc.message = invoiceRs.$.statusMessage;
            console.log('found an error: ' + doc.message);
          } else {
            doc.imported = true;
            doc.message = 'Success';
          }
          return doc.save();
        }
      });
    }
  });
}

/**
 * Parses the first two version components out of the standard four component
 * version number: `<Major>.<Minor>.<Release>.<Build>`
 * @example
 * // returns 2.0
 * parseForVersion("2.0.1.30");
 * @param input {String} A version number
 * @returns {String} First two version components (i.e. &lt;Major>.&lt;Minor>)
 * or the original input parameter if it does not match the regular expression
 */
function parseForVersion(input) {
    // As long as you get the version in right format, you could use
    // any algorithm here.
    var major = '',
        minor = '',
        version = /^(\d+)\.(\d+)(\.\w+){0,2}$/,
        versionMatch;

    versionMatch = version.exec(input.toString());

    if (versionMatch !== null) {
        major = versionMatch[1];
        minor = versionMatch[2];

        return major + '.' + minor;
    } else {
        return input;
    }
}

/**
 * Writes a string to the console and log file
 * @param input {String} String to be logged
 */
function serviceLog(data) {
    // TODO: Put the log file somewhere else
    var consoleLogging = true;
    if (consoleLogging) {
      console.log(data);
    }
}

/**
 * Logs qbws method calls and their parameters
 * @param name {String} The name of the method
 * @param params {Object} The parameters sent with the method's function call
 */
function announceMethod(name, params) {
    var arg,
        argType;

    serviceLog(chalk.green('WebMethod: ' + name +
                '() has been called by QBWebConnector'));

    // TODO: dedicated method for Object...length

    if (params != null && params != undefined && Object.getOwnPropertyNames(params).length) {
        serviceLog('    Parameters received:');
        for (arg in params) {
            if (params.hasOwnProperty(arg)) {
                // TODO: Truncate long value
                argType = typeof params[arg];
                // TODO: DRY this up
                if (argType === 'object') {
                    serviceLog('        ' + argType + ' ' + arg + ' = ' +
                               JSON.stringify(params[arg], null, 2));
                } else {
                    serviceLog('        ' + argType + ' ' + arg + ' = ' +
                               params[arg]);
                }
            }
        }
    } else {
        serviceLog('    No parameters received.');
    }
}

qbws = {
    QBWebConnectorSvc: {
        QBWebConnectorSvcSoap: {}
    }
};


/**
 * To enable web service with its version number returned back to QBWC
 * @returns {String} qbws's version number
 */
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.serverVersion =
function (args) {
    var retVal = '0.2.1';

    announceMethod('serverVersion', args);
    serviceLog('    No parameters required.');
    serviceLog('    Returned: ' + retVal);

    return {
        serverVersionResult: { string: retVal }
    };
};

/**
 * @function clientVersion
 * @summary An optional callback that allows the web service to evaluate the
 * current web connector version and react to it.
 *
 * @description An optional callback that allows the web service to evaluate
 * the current web connector version and react to it. Not currently required to
 * support backward compatibility but strongly recommended.
 *
 * Supply one of the following return strings:
 *
 *  - "NULL" or "" (empty string) if you want the Web
 *    Connector to proceed with the update
 *  - "W:<any text>" if you want the web Connector to display
 *    a WARNING dialog prompting the user to continue with the
 *    update or cancel it. The text string after the "W:" will
 *    be displayed in the warning dialog.
 *  - "E:<any text>" if you want to cancel the update and
 *    display an ERROR dialog. The text string after "E:" will
 *    be displayed in the error dialog. The user will have to
 *    download a new version of the Web Connector to continue
 *    with the update.
 *  - "O:<version number>" to tell the user that the server
 *    expects a newer version of QBWC than the user currently
 *    has but also tells the user which version is needed
 * @param strVersion {String} The version of the QB web connector supplied in the
 *                                web connector's call to clientVersion
 * @returns {String} A string telling the Web Connector what to do next.
 *
 */
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.clientVersion =
function (args) {
    var strVersion = args.strVersion,
        recommendedVersion = '2.0.1.30',
        supportedMinVersion = '1.0',
        suppliedVersion,
        retVal = '';

    suppliedVersion = parseForVersion(strVersion);

    announceMethod('clientVersion', args);

    serviceLog('    QBWebConnector Version = ' + strVersion);
    serviceLog('    Recommended Version = ' + recommendedVersion);
    serviceLog('    Supported Minimum Version = ' + supportedMinVersion);
    serviceLog('    Supplied Version = ' + suppliedVersion);

    if (strVersion < recommendedVersion) {
        retVal = 'W:We recommend that you upgrade your QBWebConnector';
    } else if (strVersion < supportedMinVersion) {
        retVal = 'E:You need to upgrade your QBWebConnector';
    }

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);

    return {
        clientVersionResult: { string: retVal }
    };
};

// WebMethod - authenticate()
// To verify username and password for the web connector that is trying to connect
//
// IN:
// string strUserName
// string strPassword
//
// OUT:
// string[] authReturn
// Possible values:
// string[0] = ticket
// string[1]
// - empty string = use current company file
// - "none" = no further request/no further action required
// - "nvu" = not valid user
// - any other string value = use this company file
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.authenticate =
function (args, callback) {
    var authReturn = [];
    announceMethod('authenticate', args);

    // Code below uses a random GUID to use as a session ticket
    // An example of a GUID is {85B41BEE-5CD9-427a-A61B-83964F1EB426}
    authReturn[0] = uuid.v1();

    // For simplicity of sample, a hardcoded username/password is used.
    // In real world, you should handle authentication in using a standard way.
    // For example, you could validate the username/password against an LDAP
    // or a directory server
    // TODO: This shouldn't be hard coded
    serviceLog('    Password locally stored = ' + password);

    if (args.strUserName.trim() === username && args.strPassword.trim() === password) {
        if (req.length === 0) {
            authReturn[1] = 'NONE';
        } else {
            // An empty string for authReturn[1] means asking QBWebConnector
            // to connect to the company file that is currently opened in QB
            authReturn[1] = companyFile;
        }
    } else {
        authReturn[1] = 'nvu';
    }

    serviceLog('    Return values: ');
    serviceLog('        string[] authReturn[0] = ' + authReturn[0]);
    serviceLog('        string[] authReturn[1] = ' + authReturn[1]);

    var promises = [];
    startingCallbacks.forEach(cb => {
      promises.push(cb());
    });

    Promise.all(promises).then((vals) => {
      console.log(vals);
      startingCallbacks = [];
    });

    callback({
      authenticateResult: { string: [authReturn[0], authReturn[1]] }
    });
};

// WebMethod - sendRequestXML()
// Description: This web method facilitates web service to send request XML to QuickBooks via QBWebConnector
//
// IN:
// int qbXMLMajorVers
// int qbXMLMinorVers
// string ticket
// string strHCPResponse
// string strCompanyFileName
// string Country
// int qbXMLMajorVers
// int qbXMLMinorVers
//
// OUT:
// string request
// Possible values:
// - any_string = Request XML for QBWebConnector to process
// - "" = No more request XML
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.sendRequestXML =
function (args, sendCallback) {
  var total,
    request = '';

  announceMethod('sendRequestXML', args);

  total = req.length;
  console.log('Sending ' + total + ' requests to QBWC.');

  // just shift the next request off the stack
  if (req.length > 0) {
    currentRequest = req.shift(); 
    request = currentRequest.xml;
  }

  sendCallback({
    sendRequestXMLResult: { string: request }
  });
};

// WebMethod - closeConnection()
// At the end of a successful update session, QBWebConnector will call this web method.
//
// IN:
// string ticket
//
// OUT:
// string closeConnection result
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.closeConnection =
function (args) {
    var retVal = null;

    announceMethod('closeConnection', args);

    retVal = 'OK';
    if (connectionErrCounter < 5) {
      var promises = [];
      finalCallbacks.forEach(cb => {
        promises.push(cb());
      });

      Promise.all(promises).then((vals) => {
        console.log(vals);
        finalCallbacks = [];
        clearRequests();
      }).catch(err => {
        console.log(err);
        clearRequests();
      });
    }
    // Resetting the connection error count and reset the requests
    connectionErrCounter = 0;

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);

    return {
        closeConnectionResult: { string: retVal }
    };
};

// WebMethod - connectionError()
// To facilitate capturing of QuickBooks error and notifying it to web services
// Description: This web method facilitates web service to handle connection error between QuickBooks and QBWebConnector
//
// IN:
// string ticket = A GUID based ticket string to maintain identity of QBWebConnector
// string hresult = An HRESULT value thrown by QuickBooks when trying to make connection
// string message = An error message corresponding to the HRESULT
//
// OUT:
// string retVal
// Possible values:
// - done = no further action required from QBWebConnector
// - any other string value = use this name for company file
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.connectionError =
function (args) {
    var hresult = args.hresult,
        message = args.message,
        retVal = null,
    // 0x80040400 - QuickBooks found an error when parsing the
    //     provided XML text stream.
        QB_ERROR_WHEN_PARSING = '0x80040400',
    // 0x80040401 - Could not access QuickBooks.
        QB_COULDNT_ACCESS_QB = '0x80040401',
    // 0x80040402 - Unexpected error. Check the qbsdklog.txt file for
    //     possible additional information.
        QB_UNEXPECTED_ERROR = '0x80040402';
    // Add more as you need...

    if (connectionErrCounter === null) {
        connectionErrCounter = 0;
    }

    announceMethod('connectionError', args);

    // TODO: Why is the same code repeated thrice? Switch statement instead?
    if (hresult.trim() === QB_ERROR_WHEN_PARSING) {
        serviceLog('    HRESULT = ' + hresult);
        serviceLog('    Message = ' + message);
        retVal = 'DONE';
    } else if (hresult.trim() === QB_COULDNT_ACCESS_QB) {
        serviceLog('    HRESULT = ' + hresult);
        serviceLog('    Message = ' + message);
        retVal = 'DONE';
    } else if (hresult.trim() === QB_UNEXPECTED_ERROR) {
        serviceLog('    HRESULT = ' + hresult);
        serviceLog('    Message = ' + message);
        retVal = 'DONE';
    } else {
        // Depending on various hresults return different value
        if (connectionErrCounter === 0) {
            // Try again with this company file
            serviceLog('    HRESULT = ' + hresult);
            serviceLog('    Message = ' + message);
            serviceLog('    Sending empty company file to try again.');
            retVal = '';
        } else {
            serviceLog('    HRESULT = ' + hresult);
            serviceLog('    Message = ' + message);
            serviceLog('    Sending DONE to stop.');
            retVal = '';
        }
    }

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);
    connectionErrCounter = connectionErrCounter + 1;

    return {
        connectionErrorResult: { string: retVal }
    };

};

// WebMethod - getInteractiveURL()
//
// IN:
// string wcTicket
// string sessionID
//
// OUT:
// URL string
// Possible values:
// URL to a website
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.getInteractiveURL =
function (args) {
  var retVal = '';

  announceMethod('getInteractiveURL', args);

  return {
    getInteractiveURLResult: { string: retVal }
  };
};

// WebMethod - getLastError()
//
// IN:
// string ticket
//
// OUT:
// string retVal
// Possible Values:
// Error message describing last web service error
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.getLastError =
function (args) {
    var errorCode = 0,
        retVal = '';

    announceMethod('getLastError', args);

    if (errorCode === -101) {
        // This is just an example of custom user errors
        retVal = 'QuickBooks was not running!';
    } else {
        retVal = 'Error!';
    }

    serviceLog('    Return values:');
    serviceLog('        string retVal = ' + retVal);

    return {
        getLastErrorResult:  { string: retVal }
    };

};

// WebMethod - interactiveDone()
//
// IN:
// string wcTicket
//
// OUT:
// string
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.interactiveDone =
function (args) {
    var retVal = '';

    announceMethod('interactiveDone', args);

    return {
        interactiveDoneResult: { string: retVal }
    };
};

// WebMethod - interactiveRejected()
//
// IN:
// string wcTicket
// string reason
//
// OUT:
// string
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.interactiveRejected =
function (args) {
    var retVal = '';

    announceMethod('interactiveRejected', args);

    return {
        interactiveRejectedResult: { string: retVal }
    };
};

// WebMethod - receiveResponseXML()
// Description: This web method facilitates web service to receive response XML from QuickBooks via QBWebConnector
//
// IN:
// string ticket
// string response
// string hresult
// string message
//
// OUT:
// int retVal
// Greater than zero  = There are more request to send
// 100 = Done. no more request to send
// Less than zero  = Custom Error codes
qbws.QBWebConnectorSvc.QBWebConnectorSvcSoap.receiveResponseXML =
function (args, responseCallback) {
  var response = args.response,
      hresult = args.hresult,
      message = args.message,
      retVal = 0,
      percentage;

  announceMethod('receiveResponseXML', args);

  // TODO: Create method for Object testing and property names length
  if (typeof hresult === 'object' && Object.getOwnPropertyNames(hresult).length !== 0) {
      // If there is an error with response received,
      //     web service could also return a -ve int
      serviceLog('    HRESULT = ' + hresult);
      serviceLog('    Message = ' + message);
      retVal = -101;
  } else {
      serviceLog('    Length of response received = ' + response.length);
  }

  var promises = [];
  console.log(currentRequest.callbacks[0]);
  currentRequest.callbacks.forEach(callback => {
    promises.push(callback(response));
  });

  Promise.all(promises).then(() => {
    // the requests in the queue may have changed
    if (req.length > 0) {
      retVal = 50;
    } else {
      retVal = 100;
    }

    var returnObject = {
      receiveResponseXMLResult: { string: retVal }
    };

    responseCallback(returnObject);
  });
};

module.exports = {
    run : function(app) {
      // server should already be started

      var soapServer,
        xml = fs.readFileSync(__dirname + '/wsdl/qbwc.wsdl', 'utf8');

      //server.listen(process.env.PORT || 8000);
      soapServer = soap.listen(app, '/wsdl', qbws, xml);

      soapServer.log = function soapServerLog(type, data) {
        serviceLog(type + ': ' + JSON.stringify(data));
      }

      soapServer.on('headers', function(headers, methodName) {
        console.log('Headers were received');
        console.log(headers);
        console.log(methodName);
      });
    },
    addRequest : addRequest,
    clearRequests : clearRequests,
    addFinalCallback: addFinalCallback,
    companyFile : companyFile,
    removeOrder: removeOrder,
    getOrders: getOrders,
    addStartingCallback: addStartingCallback,
    generateOrderRequest: generateOrderRequest
};

