$(document).ready(e => {
  let orderSearch = new SearchBar('searchBar');
  orderSearch.generateURL = function() {
    if (orderSearch.getSearchTerms() == '') {
      return '';
    }
    return '/api/orders/search/'+orderSearch.getSearchTerms();
  }
  orderSearch.run(orders => {
    console.log(orders);
    $('#searchResults').html(ordersearchresultsTemplate({
      orders: orders
    }));
  });
});