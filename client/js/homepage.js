$(document).ready(e => {
  $('#ordersGoButton').click(e => {
    redirectToPage('ordersSelect');
  });

  $('#productsGoButton').click(e => {
    redirectToPage('productsSelect');
  });

  $('#deliveriesGoButton').click(e => {
  	redirectToPage('deliveriesSelect');
  });

  $('#reportsGoButton').click(e => {
    redirectToPage('reportsSelect');
  });
});

function redirectToPage(selectId) {
  var page = $('#'+selectId).val();
  window.location = page;
}