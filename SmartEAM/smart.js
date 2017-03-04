
function contactUsMenu()
{
    console.log("Hello");
    console.log($("input[name='category']:checked").val());
    // parameters: service_id, template_id, template_parameters
    emailjs.send("default_service", "smarteam_id", {
        to_name: "Kirill",
        from_name: $("#secondname").val() + ', ' + $('#name').val(),
        email: $("#email").val(),
        phone: $("#phone").val(),
        theme: $("input[name='category']:checked").val(),
        info: $("#info").val()
    }).then(function (response) {
        console.log("SUCCESS. status=%d, text=%s", response.status, response.text);
    }, function (err) {
        console.log("FAILED. error=", err);
    });
    $('#contactForm').modal("hide");
    $('#thankYou').modal("show");
}

var scrolled = 0;

function scrollUp() {
    scrolled = scrolled - 300;
    $("html, body").stop().animate({
        scrollTop: scrolled
    });
}

w3IncludeHTML();
