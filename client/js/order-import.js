
$(document).ready(e => {
	$('#fileInput').on('change', e => {
		console.log('file change');
		$('#fileName').text(e.target.files[0].name);
	});
});