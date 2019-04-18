$(document).ready(e => {
	$('#left-menu-toggle').click(e => {
		e.preventDefault();
		$('#wrapper').toggleClass('left-toggled');
	});

	$('#right-sidebar-toggler').click(e => {
		e.preventDefault();
		$('#wrapper').toggleClass('right-toggled');
		$('#right-sidebar-icon').toggleClass('fa-angle-left');
		$('#right-sidebar-icon').toggleClass('fa-angle-right');
	});

	$('.dropdown-link').click(e => {
		$(e.target).toggleClass('active');
		$(e.target).find('[data-fa-i2svg]').toggleClass('fa-angle-down').toggleClass('fa-angle-right');
	});
});