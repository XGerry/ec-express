$(document).ready(function() {

});

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
    default:
      status = 1;
      break;
  }

  $('#getOrdersButton').addProperty('disabled');

  $.get("/api/orders", {
    limit : $('#limit').val(),
    status : status,
    startDate : $('#startDate').val(),
    endDate : $('#endDate').val()
  }).done(function(response) {
    if (response.success) {
      $('#notifications').addClass('alert-success').html(response.message);
    } else {
      $('#notifications').addClass('alert-error').html(response.message);
    }
    console.log(response.response);
  });
});