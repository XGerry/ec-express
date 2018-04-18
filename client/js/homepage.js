$(document).ready(e => {
  $('#ordersGoButton').click(e => {
    redirectToPage('ordersSelect');
  });
});

function redirectToPage(selectId) {
  var page = $('#'+selectId).val();
  window.location = page;
}