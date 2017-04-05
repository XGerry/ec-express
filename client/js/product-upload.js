$(document).ready(function() {
});

function generateNewProductForm() {
  var form = $('<form></form>');

  // Name
  var nameGroup = $('<div class="form-group row"></div>');
  var nameCol = $('<div class="col-lg-12"></div>');
  nameCol.append($('<label for="productName"></label>').text('Name'));
  nameCol.append($('<input class="form-control" id="productName" type="text">'));
  nameGroup.append(nameCol);

  // SKU
  var skuGroup = $('<div class="form-group row"></div>');
  var skuCol1 = $('<div class="col-lg-4"></div>');
  skuCol1.append($('<label for="productNumber"></label>').text('Item Number'));
  skuCol1.append($('<input class="form-control" id="productNumber" type="text">'));

  // Manufacturer's Part Number
  var skuCol2 = $('<div class="col-lg-4"></div>');
  skuCol2.append($('<label for="manufacturerNumber"></label>').text('Manufacturer\'s Number'));
  skuCol2.append($('<input class="form-control" id="manufacturerNumber" type="text">'));

  // Barcode
  var skuCol3 = $('<div class="col-lg-4"></div>');
  skuCol3.append($('<label for="barcode"></label>').text('Barcode'));
  skuCol3.append($('<input class="form-control" id="barcode" type="text">'));

  skuGroup.append(skuCol1);
  skuGroup.append(skuCol2);
  skuGroup.append(skuCol3);

  // Description
  var descGroup = $('<div class="form-group row"></div>');
  var descCol = $('<div class="col-lg-12"></div>');
  descCol.append($('<label for="description"></label>').text('Description'));
  descCol.append($('<textarea class="form-control" id="description" type="text" rows="2"></textarea>'));
  descGroup.append(descCol);

  // Category
  var categoryGroup = $('<div class="form-group row"></div>');
  var catCol = $('<div class="col-lg-12"></div>');
  catCol.append($('<label for="category"></label>').text('Category'));
  catCol.append($('<select multiple class="form-control" id="category"></select>'));
  categoryGroup.append(catCol);

  // Pricing
  var pricingGroup = $('<div class="form-group row"></div>');
  var pricingCol = $('<div class="col-lg-12"></div>');
  pricingCol.append($('<label for="price"></label>').text('Price'));
  pricingCol.append($('<input class="form-control" id="price" type="text">'))

  // Inventory - Stock & Location

  // Manufacturer

  // Country Of Origin

  // HST Code

  // Shipping Info

  // Images

  form.append(nameGroup);
  form.append(skuGroup);
  form.append(descGroup);
  $('#upload-form').append(form);
}