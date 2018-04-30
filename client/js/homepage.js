$(document).ready(e => {
  $('#ordersGoButton').click(e => {
    redirectToPage('ordersSelect');
  });

  $('#productsGoButton').click(e => {
    redirectToPage('productsSelect');
  });
});

function redirectToPage(selectId) {
  var page = $('#'+selectId).val();
  window.location = page;
}