$(document).ready(function() {

});

var orderMap = {};

$('#getOrdersButton').click(function (event) {
  var status = 1;
  var orderStatus = $('#orderStatus').val();
  switch (orderStatus) {
    case "All":
      status = 0;
      break;
    case "New":
      status = 1;
      break;
    case "Processing":
      status = 2;
      break;
    default:
      status = 1;
      break;
  }

  $('#getOrdersButton').prop('disabled', 'disabled');

  $.get("/api/orders", {
    limit : $('#limit').val(),
    status : status,
    startDate : $('#startDate').val(),
    endDate : $('#endDate').val()
  }).done(function(response) {
    $('#getOrdersButton').prop('disabled', '');
    if (response.success) {
      $('#notifications').addClass('alert-success');
    } else {
      $('#notifications').addClass('alert-error');
    }
    $('#notifications').removeClass('hidden');
    $('#message').text(response.message);
    console.log(response.response);
    showOrders(response.response);
    showInstructions();
  }).error(function(response) {
    console.log('error');
    if (response.status == 401) {
      window.location.replace('/login');
    }
  });
});

function showInstructions() {
  $('#instructions').empty();
  $('#instructions').append($('<p></p>').text('If there were orders returned from 3D cart please run the "EC-Express" app in the Quickbooks Web Connector on your computer. Select the checkbox next to EC-Express app and click "Update Selected".'));
  $('#instructions').append($('<p></p>').text('After the process is completed, click the button below to verify the orders were completed successfully.'));
  var continueButton = $('<button></button>').addClass('btn btn-primary').text('Continue');
  continueButton.click(function(e) {
    $('#confirm-orders').click();
  });
  $('#instructions').append($('<div></div>').addClass('row text-center').append(continueButton));
  $('#run-connector').click();
}

function showOrders(orderList) {
  orderMap = {};
  var resultsDiv = $('#results').empty();
  var itemTable = $('<table></table>').addClass('table table-hover').attr('id', 'resultTable');
  var itemHeader = $('<thead></thead>');
  var itemHeaderRow = $('<tr></tr>');
  var tableBody = $('<tbody></tbody>');

  // Instructions
  var instructions = $('<p></p>').text('Please confirm the orders that were successfully imported into Quickbooks by selecting the row. After the orders are confirmed, mark them as "Processing" in 3D cart by clicking the button below.');
  $('#results').append(instructions);

  // Headers
  itemHeaderRow.append($('<th></th>').text('Order Number'));
  itemHeaderRow.append($('<th></th>').text('Customer Name'));
  itemHeaderRow.append($('<th></th>').text('Company'));
  itemHeaderRow.append($('<th></th>').text('Shipping Country'));
  itemHeaderRow.append($('<th></th>').text('Total'));

  // Table Body
  orderList.forEach(function(order) {
    orderMap[order.InvoiceNumber] = order; // set the order in the map
    var row = $('<tr></tr>').attr('id', order.InvoiceNumber);
    var numberCol = $('<td></td>').text(order.InvoiceNumberPrefix + order.InvoiceNumber);
    var customerName = $('<td></td>').text(order.BillingFirstName + ' ' + order.BillingLastName);
    var companyName = $('<td></td>').text(order.BillingCompany);
    var shippingCountry = $('<td></td>').text(order.ShipmentList[0].ShipmentCountry);
    var total = $('<td></td>').text('$' + order.OrderAmount);

    row.append(numberCol);
    row.append(customerName);
    row.append(companyName);
    row.append(shippingCountry);
    row.append(total);

    tableBody.append(row);

    // events
    row.click(function() {
      $(this).toggleClass('selected');
    });
  });

  itemHeader.append(itemHeaderRow);
  itemTable.append(itemHeader);
  itemTable.append(tableBody);

  resultsDiv.append(itemTable);
  $('#resultTable').DataTable();
  console.log('tried to add the data table');

  // add buttons for the table
  var selectAll = $('<button></button>').addClass('btn btn-success').text('Select All');
  selectAll.click(function () {
    $('#resultTable tbody tr').addClass('selected');
  });

  var processingButton = $('<button></button>').addClass('btn btn-primary').text('Mark as Processing');

  processingButton.click(function() {
    processingButton.addClass('disabled');
    var selectedRows = $('#resultTable .selected');
    var ordersToSave = [];
    selectedRows.each(function (index) {
      var id = $(this).attr('id');
      var order = {};
      order.ShipmentList = [{}];
      order.OrderID = orderMap[id].OrderID;
      order.OrderStatusID = 2; // processing
      order.ShipmentList[0].ShipmentOrderStatus = 2; // processing
      order.InternalComments = 'This order was processed by EC-Express';
      ordersToSave.push(order);
    });

    $.ajax('/api/orders', {
      method : 'POST',
      data : JSON.stringify(ordersToSave),
      dataType : 'json',
      contentType : 'application/json',
      success : function(response) {
        console.log(response);
        processingButton.removeClass('disabled');
      }
    });
  });

  resultsDiv.append($('<div></div>').addClass('row text-center btn-toolbar').append(selectAll).append(processingButton));
}