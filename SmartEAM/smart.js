new WOW().init();
var scrolled = 0;

function scrollDown() {
    scrolled = scrolled + 300;
    $("html, body").stop().animate({
        scrollTop: scrolled
    });
}

function scrollUp() {
    scrolled = scrolled - 300;
    $("html, body").stop().animate({
        scrollTop: scrolled
    });
}
w3IncludeHTML();