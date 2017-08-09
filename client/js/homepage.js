$(document).ready(function() {
  $(".dropdown-toggle").dropdown();
});

$('#generateInvoiceButton').click(function (event) {
  // disable the button so we don't send the request twice
  $('#generateInvoiceButton').prop('disabled', true);

  $.get("/api/invoices", function(response) {
    $('#customs-notifications').addClass('alert-success').html(response);
  });
});

$('#getItemsButton').click(function(e) {
  $.get('/api/items', function(invoices) {
    console.log(invoices);
  });
});

$('#generateManifestButton').click(function(event) {
  $.get('/api/generate/manifest', function (responseObject) {
    console.log(responseObject);
    if (responseObject.success) {
      $('#customs-notifications').addClass('alert-success');

      // now make the manifest
      generateManifest(responseObject.response);
    }
    else {
      $('#customs-notifications').addClass('alert-warning');
    }
    
    $('#generateInvoiceButton').prop('disabled', false);
    $('#customs-notifications').html(responseObject.message);
  })
})

var generateManifest = function(orderResponse) {
  var orderList = orderResponse.QBXML.QBXMLMsgsRs.InvoiceQueryRs.InvoiceRet;
  orderList.forEach(function (order) {
    var name = $('<h3></h3>').append(order.CustomerRef.FullName);
    var invoiceNumber = $('<h4></h4>').text(order.RefNumber);
    var address = $('<p></p>').append(order.BillAddress.Addr1 + '<br/>' +
      order.BillAddress.Addr2 + '<br/>' +
      order.BillAddress.City + '<br/>' + 
      order.BillAddress.Country + '<br/>' +
      order.BillAddress.PostalCode);
    var itemTable = $('<table></table>').addClass('table');
    var itemHeader = $('<thead></thead>');
    var itemHeaderRow = $('<tr></tr>');
    
    // item table
    var tableBody = $('<tbody></tbody>');
    var total = 0;
    order.InvoiceLineRet.forEach(function (item) {
      if (!item.ItemRef) {
        return true;
      }
      var itemRow = $('<tr></tr>');
      itemRow.append($('<td></td>').text(getAttribute(item.ItemRef, 'FullName')));
      itemRow.append($('<td></td>').text(item.Desc));
      itemRow.append($('<td></td>').text(item.Quantity));
      itemRow.append($('<td></td>').text('$' + item.Rate));
      if (item.Quantity !== undefined) {
        var cost = item.Rate*item.Quantity;
        itemRow.append($('<td></td>').text('$' + cost));
        total += cost;
      } else {
        itemRow.append($('<td></td>').text('$' + item.Rate));
      }
      tableBody.append(itemRow);
    });

    // final row
    var finalRow = $('<tr></tr');
    finalRow.append($('<td></td><td></td><td></td>'));
    finalRow.append($('<td></td>').append('<strong>Total<string>'));
    finalRow.append($('<td></td>').text('$' + total));
    tableBody.append(finalRow);

    // Headers
    itemHeaderRow.append($('<th></th>').text('Item'));
    itemHeaderRow.append($('<th></th>').text('Description'));
    itemHeaderRow.append($('<th></th>').text('Quantity'));
    itemHeaderRow.append($('<th></th>').text('Price'));
    itemHeaderRow.append($('<th></th>').text('Total'));
    itemHeader.append(itemHeaderRow);
    itemTable.append(itemHeader);
    itemTable.append(tableBody);

    $('#manifest').append(name)
      .append(invoiceNumber)
      .append(address)
      .append(itemTable);
  });
}

function getAttribute(obj, name) {
  if (!obj) {
    return '';
  }
  if (!obj[name]) {
    return '';
  }
  return obj[name];
}