function pug_attr(t,e,n,f){return!1!==e&&null!=e&&(e||"class"!==t&&"style"!==t)?!0===e?" "+(f?t:t+'="'+t+'"'):("function"==typeof e.toJSON&&(e=e.toJSON()),"string"==typeof e||(e=JSON.stringify(e),n||-1===e.indexOf('"'))?(n&&(e=pug_escape(e))," "+t+'="'+e+'"'):" "+t+"='"+e.replace(/'/g,"&#39;")+"'"):""}
function pug_escape(e){var a=""+e,t=pug_match_html.exec(a);if(!t)return e;var r,c,n,s="";for(r=t.index,c=0;r<a.length;r++){switch(a.charCodeAt(r)){case 34:n="&quot;";break;case 38:n="&amp;";break;case 60:n="&lt;";break;case 62:n="&gt;";break;default:continue}c!==r&&(s+=a.substring(c,r)),c=r+1,s+=n}return c!==r?s+a.substring(c,r):s}
var pug_match_html=/["&<>]/;
function pug_rethrow(n,e,r,t){if(!(n instanceof Error))throw n;if(!("undefined"==typeof window&&e||t))throw n.message+=" on line "+r,n;try{t=t||require("fs").readFileSync(e,"utf8")}catch(e){pug_rethrow(n,null,r)}var i=3,a=t.split("\n"),o=Math.max(r-i,0),h=Math.min(a.length,r+i),i=a.slice(o,h).map(function(n,e){var t=e+o+1;return(t==r?"  > ":"    ")+t+"| "+n}).join("\n");throw n.path=e,n.message=(e||"Pug")+":"+r+"\n"+i+"\n\n"+n.message,n}function ordersearchresultsTemplate(locals) {var pug_html = "", pug_mixins = {}, pug_interp;var pug_debug_filename, pug_debug_line;try {var pug_debug_sources = {"views\u002Fclient\u002F\u002ForderSearchResults.pug":".list-group.position-absolute(style=\"width: 500px; overflow-y: auto; max-height: 600px;\").shadow\r\n\tfor order in orders\r\n\t\ta(href='\u002Forders\u002Fview\u002F'+order._id).list-group-item.list-group-item-action.flex-column.align-items-start\r\n\t\t\t.d-flex.w-100.justify-content-between\r\n\t\t\t\th5.mb-1=order.orderId\r\n\t\t\t\th5.mb-1=moment(order.orderDate).format('MMM Do YYYY')\r\n\t\t\tif (order.customer)\r\n\t\t\t\t.d-flex.justify-content-between\r\n\t\t\t\t\th6.mb-1=order.customer.name\r\n\t\t\t\t\tif (order.customer.companyName)\r\n\t\t\t\t\t\th6.mb-1=order.customer.companyName\r\n\t\t\t.d-flex.w-100.justify-content-between.text-muted\r\n\t\t\t\tp.mb-0='$' + order.orderValue.toFixed(2)\r\n\t\t\t\tp.mb-0='SKUs: ' + order.items.length\r\n\t\t\t\tp.mb-0='Items: ' + order.numberOfItems"};
;var locals_for_with = (locals || {});(function (moment, orders) {;pug_debug_line = 1;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cdiv class=\"list-group position-absolute shadow\" style=\"width: 500px; overflow-y: auto; max-height: 600px;\"\u003E";
;pug_debug_line = 2;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
// iterate orders
;(function(){
  var $$obj = orders;
  if ('number' == typeof $$obj.length) {
      for (var pug_index0 = 0, $$l = $$obj.length; pug_index0 < $$l; pug_index0++) {
        var order = $$obj[pug_index0];
;pug_debug_line = 3;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Ca" + (" class=\"list-group-item list-group-item-action flex-column align-items-start\""+pug_attr("href", '/orders/view/'+order._id, true, false)) + "\u003E";
;pug_debug_line = 4;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cdiv class=\"d-flex w-100 justify-content-between\"\u003E";
;pug_debug_line = 5;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Ch5 class=\"mb-1\"\u003E";
;pug_debug_line = 5;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = order.orderId) ? "" : pug_interp)) + "\u003C\u002Fh5\u003E";
;pug_debug_line = 6;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Ch5 class=\"mb-1\"\u003E";
;pug_debug_line = 6;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = moment(order.orderDate).format('MMM Do YYYY')) ? "" : pug_interp)) + "\u003C\u002Fh5\u003E\u003C\u002Fdiv\u003E";
;pug_debug_line = 7;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
if ((order.customer)) {
;pug_debug_line = 8;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cdiv class=\"d-flex justify-content-between\"\u003E";
;pug_debug_line = 9;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Ch6 class=\"mb-1\"\u003E";
;pug_debug_line = 9;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = order.customer.name) ? "" : pug_interp)) + "\u003C\u002Fh6\u003E";
;pug_debug_line = 10;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
if ((order.customer.companyName)) {
;pug_debug_line = 11;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Ch6 class=\"mb-1\"\u003E";
;pug_debug_line = 11;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = order.customer.companyName) ? "" : pug_interp)) + "\u003C\u002Fh6\u003E";
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
}
;pug_debug_line = 12;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cdiv class=\"d-flex w-100 justify-content-between text-muted\"\u003E";
;pug_debug_line = 13;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cp class=\"mb-0\"\u003E";
;pug_debug_line = 13;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = '$' + order.orderValue.toFixed(2)) ? "" : pug_interp)) + "\u003C\u002Fp\u003E";
;pug_debug_line = 14;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cp class=\"mb-0\"\u003E";
;pug_debug_line = 14;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = 'SKUs: ' + order.items.length) ? "" : pug_interp)) + "\u003C\u002Fp\u003E";
;pug_debug_line = 15;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cp class=\"mb-0\"\u003E";
;pug_debug_line = 15;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = 'Items: ' + order.numberOfItems) ? "" : pug_interp)) + "\u003C\u002Fp\u003E\u003C\u002Fdiv\u003E\u003C\u002Fa\u003E";
      }
  } else {
    var $$l = 0;
    for (var pug_index0 in $$obj) {
      $$l++;
      var order = $$obj[pug_index0];
;pug_debug_line = 3;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Ca" + (" class=\"list-group-item list-group-item-action flex-column align-items-start\""+pug_attr("href", '/orders/view/'+order._id, true, false)) + "\u003E";
;pug_debug_line = 4;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cdiv class=\"d-flex w-100 justify-content-between\"\u003E";
;pug_debug_line = 5;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Ch5 class=\"mb-1\"\u003E";
;pug_debug_line = 5;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = order.orderId) ? "" : pug_interp)) + "\u003C\u002Fh5\u003E";
;pug_debug_line = 6;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Ch5 class=\"mb-1\"\u003E";
;pug_debug_line = 6;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = moment(order.orderDate).format('MMM Do YYYY')) ? "" : pug_interp)) + "\u003C\u002Fh5\u003E\u003C\u002Fdiv\u003E";
;pug_debug_line = 7;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
if ((order.customer)) {
;pug_debug_line = 8;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cdiv class=\"d-flex justify-content-between\"\u003E";
;pug_debug_line = 9;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Ch6 class=\"mb-1\"\u003E";
;pug_debug_line = 9;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = order.customer.name) ? "" : pug_interp)) + "\u003C\u002Fh6\u003E";
;pug_debug_line = 10;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
if ((order.customer.companyName)) {
;pug_debug_line = 11;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Ch6 class=\"mb-1\"\u003E";
;pug_debug_line = 11;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = order.customer.companyName) ? "" : pug_interp)) + "\u003C\u002Fh6\u003E";
}
pug_html = pug_html + "\u003C\u002Fdiv\u003E";
}
;pug_debug_line = 12;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cdiv class=\"d-flex w-100 justify-content-between text-muted\"\u003E";
;pug_debug_line = 13;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cp class=\"mb-0\"\u003E";
;pug_debug_line = 13;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = '$' + order.orderValue.toFixed(2)) ? "" : pug_interp)) + "\u003C\u002Fp\u003E";
;pug_debug_line = 14;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cp class=\"mb-0\"\u003E";
;pug_debug_line = 14;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = 'SKUs: ' + order.items.length) ? "" : pug_interp)) + "\u003C\u002Fp\u003E";
;pug_debug_line = 15;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + "\u003Cp class=\"mb-0\"\u003E";
;pug_debug_line = 15;pug_debug_filename = "views\u002Fclient\u002F\u002ForderSearchResults.pug";
pug_html = pug_html + (pug_escape(null == (pug_interp = 'Items: ' + order.numberOfItems) ? "" : pug_interp)) + "\u003C\u002Fp\u003E\u003C\u002Fdiv\u003E\u003C\u002Fa\u003E";
    }
  }
}).call(this);

pug_html = pug_html + "\u003C\u002Fdiv\u003E";}.call(this,"moment" in locals_for_with?locals_for_with.moment:typeof moment!=="undefined"?moment:undefined,"orders" in locals_for_with?locals_for_with.orders:typeof orders!=="undefined"?orders:undefined));} catch (err) {pug_rethrow(err, pug_debug_filename, pug_debug_line, pug_debug_sources[pug_debug_filename]);};return pug_html;}