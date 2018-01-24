$(document).ready(e => {

});

function buildTableBody(manifests) {
	console.log(manifests);
	manifests.forEach(manifest => {
		var row = $('<tr></tr>');
		var modifiedCol = $('<td></td>');
		var shipDateCol = $('<td></td>');
		var parcelCol = $('<td></td>');

		var modifiedDate = new Date(manifest.lastModified);
		var shipDate = new Date(manifest.shipDate);

		modifiedCol.text(modifiedDate.toDateString() + ' ' + modifiedDate.getHours() + ':' + modifiedDate.getMinutes());
		shipDateCol.text(shipDate.toDateString());
		parcelCol.text(manifest.totalParcels);

		row.append(modifiedCol);			
		row.append(shipDateCol);			
		row.append(parcelCol);			

		$('#manifestTable').append(row);

		row.click(e => {
			window.location = '/customs?id='+manifest._id+'';
		});
	});

}