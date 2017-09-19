var socket = io();

$(document).ready(function() {
  $('#last-import').click(function (e) {
    $.get("/api/orders/errors").done(function(response) {
      showOrders(response);
    });
  });
});

socket.on('getOrdersFinished', function(orders) {
  console.log(orders);
  showInstructions();
  $('#notifications').addClass('alert-success');
  $('#message').text('Received ' + orders.length + ' orders from 3D Cart.');
  $('#notifications').removeClass('hidden');
  $('#getOrdersButton').removeClass('disabled');
});

$('#getOrdersButton').click(function(e) {
  var status = $('#orderStatus').val();

  var query = {
    status: status,
    startDate: $('#startDate').val(),
    endDate: $('#endDate').val()
  };

  socket.emit('getOrders', query);
  $('#getOrdersButton').addClass('disabled');
});

function showInstructions() {
  $('#instructions').empty();
  $('#instructions').append($('<p></p>').text('If there were orders returned from 3D cart please run the "EC-Express" app in the Quickbooks Web Connector on your computer. Select the checkbox next to EC-Express app and click "Update Selected".'));
  $('#instructions').append($('<p></p>').text('After the process is completed, click the button below to verify the orders were completed successfully.'));
  var continueButton = $('<button></button>').addClass('btn btn-primary').text('Continue');
  continueButton.click(function(e) {
    $.get("/api/orders/errors").done(function(response) {
      showOrders(response);
      $('#report').click();
    });
  });
  $('#instructions').append($('<div></div>').addClass('row text-center').append(continueButton));
  $('#run-connector').click();
}

function showOrders(orders) {
  var errorsDiv = $('#errors').empty();
  errorsDiv.append($('<h2>Errors</h2>'));
  var successDiv = $('#successes').empty();
  successDiv.append($('<h2>Completed</h2>'));

  var errorTable = $('<table></table>').addClass('table table-hover').attr('id', 'errorTable');
  var successTable = $('<table></table>').addClass('table table-hover').attr('id', 'successTable');
  
  var itemHeader = $('<thead></thead>');
  var itemHeaderRow = $('<tr></tr>');
  var tableBody = $('<tbody></tbody>');

  var successTableBody = $('<tbody></tbody>');
  var successHeader = $('<thead></thead>');
  var successHeaderRow = $('<tr></tr>');

  // success headers
  successHeaderRow.append($('<th></th>').text('Order Number'));
  successHeaderRow.append($('<th></th>').text('Customer Name'));
  successHeaderRow.append($('<th></th>').text('Country'));
  successHeaderRow.append($('<th></th>').text('Total'));

  // error headers
  itemHeaderRow.append($('<th></th>').text('Order Number'));
  itemHeaderRow.append($('<th></th>').text('Customer Name'));
  itemHeaderRow.append($('<th></th>').text('Error Message'));
  itemHeaderRow.append($('<th></th>').text('Total'));

  orders.successes.forEach(function(order) {
    var row = $('<tr></tr>').attr('id', order.InvoiceNumber+'_success');
    var numberCol = $('<td></td>').text(order.InvoiceNumberPrefix + order.InvoiceNumber);
    var customerName = $('<td></td>').text(order.BillingFirstName + ' ' + order.BillingLastName);
    var country = $('<td></td>').text(order.ShipmentList[0].ShipmentCountry);
    var total = $('<td></td>').text('$' + (order.OrderAmount + order.SalesTax2).toFixed(2));

    row.append(numberCol);
    row.append(customerName);
    row.append(country);
    row.append(total);

    successTableBody.append(row);
  });

  // Error Table Body
  orders.errors.forEach(function(order) {
    var row = $('<tr></tr>').attr('id', order.InvoiceNumber);
    var numberCol = $('<td></td>').text(order.InvoiceNumberPrefix + order.InvoiceNumber);
    var customerName = $('<td></td>').text(order.BillingFirstName + ' ' + order.BillingLastName);
    var message = order.errorMessage;
    if (!message) {
      message = "Please run the Web Connector";
    }
    var errorMessage = $('<td></td>').text(message);
    var total = $('<td></td>').text('$' + (order.OrderAmount + order.SalesTax2).toFixed(2));

    row.append(numberCol);
    row.append(customerName);
    row.append(errorMessage);
    row.append(total);

    tableBody.append(row);
  });

  itemHeader.append(itemHeaderRow);
  errorTable.append(itemHeader);
  errorTable.append(tableBody);

  successHeader.append(successHeaderRow);
  successTable.append(successHeader);
  successTable.append(successTableBody);

  errorsDiv.append(errorTable);
  successDiv.append(successTable);

  $('#errorTable').DataTable();
  $('#successTable').DataTable();

  var markOrdersAsProcessingButton = $('<button></button>').addClass('btn btn-primary').text('Mark Completed As Processing');
  errorsDiv.append(markOrdersAsProcessingButton);

  markOrdersAsProcessingButton.click(function(e) {
    markOrdersAsProcessingButton.prop('disabled', 'disabled');
    $.get('/api/orders/updateCompleted', function(response) {
      console.log(response);
      markOrdersAsProcessingButton.prop('disabled', '');
    });
  });
}