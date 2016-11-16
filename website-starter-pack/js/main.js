var Monthes = {Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5,
    Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12};
// load data
queue()
    .defer(d3.json, "/oblasti.json")
    .defer(d3.json, "/dataviz1.json")
    .defer(d3.json, "/data/report_1_2013.json")
    .defer(d3.json, "/data/report_2_2013.json")
    .defer(d3.json, "/data/report_3_2013.json")
    .await(ready);

function ready(error, oblasti, dataviz1) {

    $("#datepicker").datepicker({
        format: "mm-yyyy",
        viewMode: "months",
        minViewMode: "months",
        startDate: '01-2013'
    });
    $('#datepicker').datepicker('update', new Date(2013, 1, 1));
    $("#datepicker").datepicker().on('changeDate', function (e) {
        updateMap();
    });

    // Whenever the brush moves, re-rendering everything.
    function renderAll() {
        updateMap();
    }

    function updateMap() {
        var month = Monthes[String($("#datepicker").datepicker('getDate')).split(" ")[1]];
        console.log(month);
        var year = String($("#datepicker").datepicker('getDate')).split(" ")[3];
        $.getJSON('/data/report_' + month + '_' + year + '.json', function (data) {
            render_map(dataviz1.coordinates, oblasti, data.quantities);
        });
    }

    function render_map(data, borders, quantity) {
//console.log(borders);
        var width = 980,
            height = 750;

        var canvas = d3.select("#chart").node(),
            context = canvas.getContext("2d");

        // bounding box for Ukraine
        var xmax = 40.5; // d3.max(data, function(d){ return d.lon})
        var xmin = 22.0; //d3.min(data, function(d){ return d.lon})

        var ymax = 53.5; //d3.max(data, function(d){ return d.lat})
        var ymin = 44.0; //d3.min(data, function(d){ return d.lat})

        // scales
        //var cs_x = d3.scale.linear().domain([xmin, xmax]).range([0, width]);
        var cs_x = width / (xmax - xmin);
        //var cs_y = d3.scale.linear().domain([ymin, ymax]).range([0, height]);
        var cs_y = height / (ymax - ymin);

        var rad_scale = d3.scale.linear().domain([10, 2600]).range([0.1, 2.6]);
        var color = d3.scale.linear()
            .domain([-0.8, 0, 0.8])
            .range(["#05528e", "silver", "#e0700b"]);


        d3.select(canvas)
            .attr("width", width)
            .attr("height", height)


        // clear all
        context.fillStyle = "rgba(" + 255 + "," + 255 + "," + 255 + "," + 1 + ")";
        context.fillRect(0, 0, width, height);
        context.globalAlpha = 0.4;


        // draw borders
        context.beginPath();
        for (var i = 0, l = borders.features.length; i < l; i++) {
            var feature = borders.features[i];
            var coords = feature.geometry.coordinates;
            //cs_x*(p.lon-xmin), height - 40 - cs_y*(p.lat-ymin)
            context.moveTo(cs_x * (coords[0][0] - xmin), height - 40 - cs_y * (coords[0][1] - ymin));
            for (var i1 = 1, l1 = coords.length; i1 < l1; i1++) {
                var pair = coords[i1];
                context.lineTo(cs_x * (pair[0] - xmin), height - 40 - cs_y * (pair[1] - ymin));
            }
        }

        context.strokeStyle = "#000";
        context.lineWidth = 1;
        context.stroke();
        // eof  draw borders
        var i = -1,
            n = data.length;

        //for(var ovk_num in data){
        while (++i < n) {
            var p = data[i];
            context.fillStyle = "#f8931d";
            // draw station as a circle, actually
            context.beginPath();
            if (quantity == null)
                context.arc(cs_x * (p.lon - xmin), height - 40 - cs_y * (p.lat - ymin), 5, 0, 2 * Math.PI, true);
            else {
                context.arc(cs_x * (p.lon - xmin), height - 40 - cs_y * (p.lat - ymin), quantity[i].qua / 4000, 0, 2 * Math.PI, true);
            }
            context.fill();
            context.fillStyle = "#000000";
            //There are several options for setting text
            context.font = "bolder 14px Arial";
            //textAlign supports: start, end, left, right, center
            context.textAlign = "center"
            //textBaseline supports: top, hanging, middle, alphabetic, ideographic bottom
            if (quantity != null) {
                context.textBaseline = "hanging"
                context.fillText(quantity[i].qua, cs_x * (p.lon - xmin), height - 40 - cs_y * (p.lat - ymin));
            }
            context.closePath();
        }
    }
    renderAll();
}