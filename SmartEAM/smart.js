
var scrolled = 0;

function scrollUp() {
    scrolled = scrolled - 300;
    $("html, body").stop().animate({
        scrollTop: scrolled
    });
}

w3IncludeHTML();
